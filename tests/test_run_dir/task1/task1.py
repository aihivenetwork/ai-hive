from test_helpers.utils import file_check

from aihive import Task, task
from aihive.dataset import Sample
from aihive.scorer import includes
from aihive.solver import generate


@task
def task1():
    return Task(
        dataset=[Sample(input="What is 1+1?", target="2")],
        solver=[file_check("task1.py"), generate()],
        scorer=includes(),
        metadata={"task_idx": 1},
    )
