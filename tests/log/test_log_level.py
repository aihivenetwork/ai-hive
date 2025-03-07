from logging import DEBUG, getLogger

from aihive import Task, eval
from aihive.log._log import EvalLog
from aihive.log._transcript import LoggerEvent
from aihive.model import get_model
from aihive.solver import Generate, TaskState, solver

logger = getLogger(__name__)


@solver
def logging_solver(level_no: int):
    async def solve(state: TaskState, generate: Generate):
        logger.log(level_no, "sandbox log entry")
        return state

    return solve


def find_logger_event(log: EvalLog) -> LoggerEvent | None:
    if log.samples:
        return next(
            (
                event
                for event in log.samples[0].transcript.events
                if isinstance(event, LoggerEvent)
            ),
            None,
        )
    else:
        return None


def test_log_file_exclude_level() -> None:
    log = eval(
        Task(solver=logging_solver(DEBUG)),
        model=get_model("mockllm/model"),
        log_level="debug",
        log_level_transcript="warning",
    )[0]
    event = find_logger_event(log)
    assert event is None
