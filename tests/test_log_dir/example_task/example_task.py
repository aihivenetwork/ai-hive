from aihive import Task, task
from aihive.dataset import Sample
from aihive.scorer import match


@task
def example_task() -> Task:
    task = Task(
        dataset=[Sample(input="Say Hello", target="Hello")],
        scorer=match(),
        metadata={"meaning_of_life": 42},
    )
    return task
