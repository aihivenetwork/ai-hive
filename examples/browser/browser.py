from aihive import Task, task
from aihive.dataset import Sample
from aihive.scorer import includes
from aihive.solver import generate, use_tools
from aihive.tool import web_browser


@task
def browser():
    return Task(
        dataset=[
            Sample(
                input=""
            )
        ],
        solver=[
            use_tools(web_browser()),
            generate(),
        ],
        scorer=includes(),
        sandbox="docker",
    )
