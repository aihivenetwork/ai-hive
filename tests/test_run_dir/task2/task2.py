from test_helpers.utils import file_check

from aihive import Task, task
from aihive.dataset import Sample
from aihive.scorer import includes
from aihive.solver import generate


@task
def task2():
    return Task(
        dataset=[
            Sample(id=id, input="What is 1+1?", target="2") for id in range(0, 10)
        ],
        solver=[file_check("task2.py"), generate()],
        scorer=includes(),
        metadata={"task_idx": 2},
    )
