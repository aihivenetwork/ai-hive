from aihive import Task, task
from aihive.dataset import FieldSpec, example_dataset
from aihive.scorer import model_graded_qa
from aihive.solver import generate, use_tools
from aihive.tool import web_search


@task
def biology_qa() -> Task:
    return Task(
        dataset=example_dataset(
            name="biology_qa",
            sample_fields=FieldSpec(input="question", target="answer"),
        ),
        solver=[use_tools(web_search()), generate()],
        scorer=model_graded_qa(),
    )
