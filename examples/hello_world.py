from aihive import Task, task
from aihive.dataset import Sample
from aihive.scorer import exact
from aihive.solver import generate

# This is the simplest possible aihive eval, useful for testing your configuration / network / platform etc.


@task
def hello_world():
    return Task(
        dataset=[
            Sample(
                input="Just reply with Hello World",
                target="Hello World",
            )
        ],
        solver=[
            generate(),
        ],
        scorer=exact(),
    )
