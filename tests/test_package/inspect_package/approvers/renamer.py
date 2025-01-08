from copy import copy

from aihive.approval import Approval, Approver, approver
from aihive.solver import TaskState
from aihive.tool import ToolCall, ToolCallView


@approver
def renamer(function_name: str) -> Approver:
    async def approve(
        message: str,
        call: ToolCall,
        view: ToolCallView,
        state: TaskState | None = None,
    ) -> Approval:
        call = copy(call)
        call.function = function_name
        return Approval(decision="modify", modified=call)

    return approve
