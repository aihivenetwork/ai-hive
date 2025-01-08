from aihive import Task, task
from aihive.dataset import Sample
from aihive.scorer import includes
from aihive.solver import generate, use_tools
from aihive.tool import Tool


@task
def empty_task() -> Task:
    return Task()


@task
def minimal_task() -> Task:
    return Task(
        dataset=[Sample(input="What is 1+1?", target="2")],
        solver=[generate()],
        scorer=includes(),
        metadata={"task_idx": 1},
    )


@task
def minimal_task_for_tool_use(tool: Tool) -> Task:
    return Task(
        dataset=[Sample(input="Please use the tool", target="n/a")],
        solver=[use_tools(tool), generate()],
        scorer=includes(),
        metadata={"task_idx": 1},
        message_limit=3,
        sandbox="docker",
    )
