from aihive import Task, eval
from aihive.dataset import Sample
from aihive.model import ModelOutput, get_model
from aihive.scorer import match
from aihive.solver import generate, use_tools
from aihive.tool import ToolDef


def test_tool_def() -> None:
    model = get_model(
        "mockllm/model",
        custom_outputs=[
            ModelOutput.for_tool_call(
                "mockllm/model",
                tool_name="addition2",
                tool_arguments={"x": 1, "y": 1},
            ),
            ModelOutput.from_content("mockllm/model", content="2"),
        ],
    )

    async def addition(x: int, y: int):
        return x + y

    addition_tool = ToolDef(
        tool=addition,
        name="addition2",
        description="Add two numbers",
        parameters={"x": "Integer", "y": "Integer"},
    )

    task = Task(
        dataset=[Sample(input="What is 1 + 1?", target="2")],
        solver=[use_tools(addition_tool.as_tool()), generate()],
        scorer=match(numeric=True),
    )

    log = eval(task, model=model)[0]
    assert log.status == "success"
