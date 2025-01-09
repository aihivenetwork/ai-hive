# ruff: noqa: F401 F403 F405

from importlib.metadata import version as importlib_version

from aihive._eval.eval import eval, eval_async, eval_retry, eval_retry_async
from aihive._eval.evalset import eval_set
from aihive._eval.list import list_tasks
from aihive._eval.registry import task
from aihive._eval.score import score, score_async
from aihive._eval.task import Epochs, Task, TaskInfo, Tasks
from aihive._util.constants import PKG_NAME

__version__ = importlib_version(PKG_NAME)


__all__ = [
    "__version__",
    "eval",
    "eval_async",
    "eval_retry",
    "eval_retry_async",
    "eval_set",
    "list_tasks",
    "score",
    "score_async",
    "Epochs",
    "Task",
    "TaskInfo",
    "Tasks",
    "task",
]
