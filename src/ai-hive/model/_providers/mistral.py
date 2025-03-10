import functools
import json
import os
from typing import Any, Literal

from httpcore import ReadTimeout
from httpx import ReadTimeout as AsyncReadTimeout
from mistralai import (
    ContentChunk,
    FunctionCall,
    FunctionName,
    ImageURL,
    ImageURLChunk,
    Mistral,
    ReferenceChunk,
    TextChunk,
)
from mistralai.models import (
    AssistantMessage as MistralAssistantMessage,
)
from mistralai.models import (
    ChatCompletionChoice as MistralChatCompletionChoice,
)
from mistralai.models import Function as MistralFunction
from mistralai.models import SDKError
from mistralai.models import SystemMessage as MistralSystemMessage
from mistralai.models import Tool as MistralTool
from mistralai.models import ToolCall as MistralToolCall
from mistralai.models import (
    ToolChoice as MistralToolChoice,
)
from mistralai.models import ToolMessage as MistralToolMessage
from mistralai.models import UserMessage as MistralUserMessage
from mistralai.models.chatcompletionresponse import (
    ChatCompletionResponse as MistralChatCompletionResponse,
)
from typing_extensions import override

# TODO: Migration guide:
# https://github.com/mistralai/client-python/blob/main/MIGRATION.md
from aihive._util.constants import (
    DEFAULT_TIMEOUT,
)
from aihive._util.content import Content, ContentImage, ContentText
from aihive._util.images import image_as_data_uri
from aihive._util.url import is_data_uri
from aihive.tool import ToolCall, ToolChoice, ToolFunction, ToolInfo

from .._chat_message import (
    ChatMessage,
    ChatMessageAssistant,
)
from .._generate_config import GenerateConfig
from .._model import ModelAPI
from .._model_call import ModelCall
from .._model_output import (
    ChatCompletionChoice,
    ModelOutput,
    ModelUsage,
    StopReason,
)
from .util import environment_prerequisite_error, model_base_url, parse_tool_call

AZURE_MISTRAL_API_KEY = "AZURE_MISTRAL_API_KEY"
AZUREAI_MISTRAL_API_KEY = "AZUREAI_MISTRAL_API_KEY"
MISTRAL_API_KEY = "MISTRAL_API_KEY"


class MistralAPI(ModelAPI):
    def __init__(
        self,
        model_name: str,
        base_url: str | None = None,
        api_key: str | None = None,
        config: GenerateConfig = GenerateConfig(),
        **model_args: Any,
    ):
        super().__init__(
            model_name=model_name,
            base_url=base_url,
            api_key=api_key,
            api_key_vars=[
                MISTRAL_API_KEY,
                AZURE_MISTRAL_API_KEY,
                AZUREAI_MISTRAL_API_KEY,
            ],
            config=config,
        )

        # resolve api_key -- look for mistral then azure
        if not self.api_key:
            self.api_key = os.environ.get(MISTRAL_API_KEY, None)
            if self.api_key:
                base_url = model_base_url(base_url, "MISTRAL_BASE_URL")
            else:
                self.api_key = os.environ.get(
                    AZUREAI_MISTRAL_API_KEY, os.environ.get(AZURE_MISTRAL_API_KEY, None)
                )
                if not self.api_key:
                    raise environment_prerequisite_error(
                        "Mistral", [MISTRAL_API_KEY, AZUREAI_MISTRAL_API_KEY]
                    )
                base_url = model_base_url(base_url, "AZUREAI_MISTRAL_BASE_URL")
                if not base_url:
                    raise ValueError(
                        "You must provide a base URL when using Mistral on Azure. Use the AZUREAI_MISTRAL_BASE_URL "
                        + " environment variable or the --model-base-url CLI flag to set the base URL."
                    )

        if base_url:
            model_args["server_url"] = base_url

        # create client
        self.client = Mistral(
            api_key=self.api_key,
            timeout_ms=(config.timeout if config.timeout else DEFAULT_TIMEOUT) * 1000,
            **model_args,
        )

    async def generate(
        self,
        input: list[ChatMessage],
        tools: list[ToolInfo],
        tool_choice: ToolChoice,
        config: GenerateConfig,
    ) -> ModelOutput | tuple[ModelOutput, ModelCall]:
        # build request
        request: dict[str, Any] = dict(
            model=self.model_name,
            messages=await mistral_chat_messages(input),
            tools=mistral_chat_tools(tools) if len(tools) > 0 else None,
            tool_choice=(
                mistral_chat_tool_choice(tool_choice) if len(tools) > 0 else None
            ),
        )
        if config.temperature is not None:
            request["temperature"] = config.temperature
        if config.top_p is not None:
            request["top_p"] = config.top_p
        if config.max_tokens is not None:
            request["max_tokens"] = config.max_tokens
        if config.seed is not None:
            request["random_seed"] = config.seed

        # send request
        try:
            response = await self.client.chat.complete_async(**request)
        except SDKError as ex:
            if ex.status_code == 400:
                return self.handle_bad_request(ex)
            else:
                raise ex

        if response is None:
            raise RuntimeError("Mistral model did not return a response from generate.")

        # return model output (w/ tool calls if they exist)
        choices = completion_choices_from_response(response, tools)
        return ModelOutput(
            model=response.model,
            choices=choices,
            usage=ModelUsage(
                input_tokens=response.usage.prompt_tokens,
                output_tokens=(
                    response.usage.completion_tokens
                    if response.usage.completion_tokens
                    else response.usage.total_tokens - response.usage.prompt_tokens
                ),
                total_tokens=response.usage.total_tokens,
            ),
        ), mistral_model_call(request, response)

    @override
    def is_rate_limit(self, ex: BaseException) -> bool:
        return (
            isinstance(ex, SDKError)
            and ex.status_code == 429
            or isinstance(ex, ReadTimeout | AsyncReadTimeout)
        )

    @override
    def connection_key(self) -> str:
        return str(self.api_key)

    def handle_bad_request(self, ex: SDKError) -> ModelOutput:
        if "maximum context length" in ex.body:
            body = json.loads(ex.body)
            content = body.get("message", ex.body)
            return ModelOutput.from_content(
                model=self.model_name, content=content, stop_reason="model_length"
            )
        else:
            raise ex


def mistral_model_call(
    request: dict[str, Any], response: MistralChatCompletionResponse
) -> ModelCall:
    request = request.copy()
    request.update(messages=[message.model_dump() for message in request["messages"]])
    if request.get("tools", None) is not None:
        request["tools"] = [tool.model_dump() for tool in request["tools"]]
    return ModelCall(request=request, response=response.model_dump())


def mistral_chat_tools(tools: list[ToolInfo]) -> list[MistralTool]:
    return [
        MistralTool(
            type="function",
            function=mistral_function(tool),
        )
        for tool in tools
    ]


def mistral_function(tool: ToolInfo) -> MistralFunction:
    return MistralFunction(
        name=tool.name,
        description=tool.description,
        parameters={
            k: v.model_dump(exclude={"additionalProperties"}, exclude_none=True)
            for k, v in tool.parameters.properties.items()
        },
    )


def mistral_chat_tool_choice(
    tool_choice: ToolChoice,
) -> str | dict[str, Any]:
    if isinstance(tool_choice, ToolFunction):
        return MistralToolChoice(
            type="function", function=FunctionName(name=tool_choice.name)
        ).model_dump()
    elif tool_choice == "any":
        return "any"
    elif tool_choice == "auto":
        return "auto"
    elif tool_choice == "none":
        return "none"


MistralMessage = (
    MistralSystemMessage
    | MistralUserMessage
    | MistralAssistantMessage
    | MistralToolMessage
)


async def mistral_chat_messages(messages: list[ChatMessage]) -> list[MistralMessage]:
    mistral_messages = [await mistral_chat_message(message) for message in messages]
    mistral_messages = functools.reduce(mistral_message_reducer, mistral_messages, [])
    return mistral_messages


def mistral_message_reducer(
    messages: list[MistralMessage],
    message: MistralMessage,
) -> list[MistralMessage]:
    if (
        len(messages) > 0
        and isinstance(messages[-1], MistralToolMessage)
        and isinstance(message, MistralUserMessage)
    ):
        messages[-1] = fold_user_message_into_tool_message(messages[-1], message)
    else:
        messages.append(message)
    return messages


def fold_user_message_into_tool_message(
    tool: MistralToolMessage, user: MistralUserMessage
) -> MistralToolMessage:
    def normalise_content(
        content: str | list[ContentChunk] | None,
    ) -> list[ContentChunk]:
        return (
            []
            if content is None
            else [TextChunk(text=content)]
            if isinstance(content, str)
            else content
        )

    # normalise tool and user content
    tool_content = normalise_content(tool.content)
    user_content = normalise_content(user.content)

    # return tool message w/ tool and user content combined
    return MistralToolMessage(
        content=tool_content + user_content,
        tool_call_id=tool.tool_call_id,
        name=tool.name,
        role=tool.role,
    )


async def mistral_chat_message(
    message: ChatMessage,
) -> MistralMessage:
    if message.role == "assistant" and message.tool_calls:
        return MistralAssistantMessage(
            role=message.role,
            content=await mistral_message_content(message.content),
            tool_calls=[mistral_tool_call(call) for call in message.tool_calls],
        )
    elif message.role == "tool":
        return MistralToolMessage(
            role=message.role,
            tool_call_id=message.tool_call_id,
            name=message.function,
            content=(
                f"Error: {message.error.message}" if message.error else message.text
            ),
        )
    elif message.role == "user":
        return MistralUserMessage(
            content=await mistral_message_content(message.content)
        )
    elif message.role == "system":
        return MistralSystemMessage(
            content=mistral_system_message_content(message.content)
        )
    elif message.role == "assistant":
        return MistralAssistantMessage(
            content=await mistral_message_content(message.content)
        )


NO_CONTENT = "(no content)"


async def mistral_message_content(
    content: str | list[Content],
) -> str | list[ContentChunk]:
    if isinstance(content, str):
        return content or NO_CONTENT
    else:
        return [await mistral_content_chunk(c) for c in content]


def mistral_system_message_content(
    content: str | list[Content],
) -> str | list[TextChunk]:
    if isinstance(content, str):
        return content or NO_CONTENT
    else:
        return [TextChunk(text=c.text) for c in content if isinstance(c, ContentText)]


async def mistral_content_chunk(content: Content) -> ContentChunk:
    if isinstance(content, ContentText):
        return TextChunk(text=content.text or NO_CONTENT)
    else:
        # resolve image to url
        image_url = content.image
        if not is_data_uri(image_url):
            image_url = await image_as_data_uri(image_url)

        # return chunk
        return ImageURLChunk(
            image_url=ImageURL(url=content.image, detail=content.detail)
        )


def mistral_tool_call(tool_call: ToolCall) -> MistralToolCall:
    return MistralToolCall(
        id=tool_call.id, function=mistral_function_call(tool_call), type="function"
    )


def mistral_function_call(tool_call: ToolCall) -> FunctionCall:
    return FunctionCall(
        name=tool_call.function, arguments=json.dumps(tool_call.arguments)
    )


def chat_tool_calls(
    tool_calls: list[MistralToolCall], tools: list[ToolInfo]
) -> list[ToolCall]:
    return [chat_tool_call(tool, tools) for tool in tool_calls]


def chat_tool_call(tool_call: MistralToolCall, tools: list[ToolInfo]) -> ToolCall:
    id = tool_call.id or tool_call.function.name
    if isinstance(tool_call.function.arguments, str):
        return parse_tool_call(
            id, tool_call.function.name, tool_call.function.arguments, tools
        )
    else:
        return ToolCall(
            id, tool_call.function.name, tool_call.function.arguments, type="function"
        )


def completion_choice(
    choice: MistralChatCompletionChoice, tools: list[ToolInfo]
) -> ChatCompletionChoice:
    message = choice.message
    if message:
        completion = completion_content(message.content or "")
        return ChatCompletionChoice(
            message=ChatMessageAssistant(
                content=completion,
                tool_calls=chat_tool_calls(message.tool_calls, tools)
                if message.tool_calls
                else None,
                source="generate",
            ),
            stop_reason=(
                choice_stop_reason(choice)
                if choice.finish_reason is not None
                else "unknown"
            ),
        )
    else:
        raise ValueError(
            f"Mistral did not return a message in Completion Choice: {choice.model_dump_json(indent=2, exclude_none=True)}"
        )


def completion_content(content: str | list[ContentChunk]) -> str | list[Content]:
    if isinstance(content, str):
        return content
    else:
        return [completion_content_chunk(c) for c in content]


def completion_content_chunk(content: ContentChunk) -> Content:
    if isinstance(content, ReferenceChunk):
        raise TypeError("ReferenceChunk content is not supported by aihive.")
    elif isinstance(content, TextChunk):
        return ContentText(text=content.text)
    else:
        if isinstance(content.image_url, str):
            return ContentImage(image=content.image_url)
        else:
            match content.image_url.detail:
                case "low" | "high":
                    detail: Literal["auto", "low", "high"] = content.image_url.detail
                case _:
                    detail = "auto"
            return ContentImage(image=content.image_url.url, detail=detail)


def completion_choices_from_response(
    response: MistralChatCompletionResponse, tools: list[ToolInfo]
) -> list[ChatCompletionChoice]:
    if response.choices is None:
        return []
    else:
        return [completion_choice(choice, tools) for choice in response.choices]


def choice_stop_reason(choice: MistralChatCompletionChoice) -> StopReason:
    match choice.finish_reason:
        case "stop":
            return "stop"
        case "length":
            return "max_tokens"
        case "model_length" | "tool_calls":
            return choice.finish_reason
        case _:
            return "unknown"
