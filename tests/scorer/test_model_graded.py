from typing import Callable

from aihive import Task, eval
from aihive.dataset import Sample
from aihive.model import ChatMessageAssistant, ChatMessageUser
from aihive.scorer import model_graded_fact
from aihive.solver._task_state import TaskState


def include_history_task(include_history: bool | Callable[[TaskState], str]) -> Task:
    return Task(
        dataset=[
            Sample(
                input=[
                    ChatMessageUser(content="Who wrote 'The 39 Steps'?"),
                    ChatMessageAssistant(
                        content="Do you mean the movie or the adaption for the stage?"
                    ),
                    ChatMessageUser(content="The movie."),
                ],
                target="Alfred Hitchcock",
            )
        ],
        scorer=model_graded_fact(
            include_history=include_history, model="mockllm/model"
        ),
    )


def test_model_graded_include_history():
    def check_include_history(include_history: bool | Callable[[TaskState], str]):
        log = eval(include_history_task(include_history), model="mockllm/model")[0]
        assert log.samples
        assert "Do you mean the movie" in log.samples[0].model_dump_json()

    check_include_history(True)
    check_include_history(
        lambda state: "\n".join([message.text for message in state.messages])
    )
