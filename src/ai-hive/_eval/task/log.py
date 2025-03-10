from importlib import metadata as importlib_metadata
from typing import Any, Literal, cast

from shortuuid import uuid

from aihive._eval.task.util import slice_dataset
from aihive._util.constants import (
    PKG_NAME,
)
from aihive._util.datetime import iso_now
from aihive._util.git import git_context
from aihive._util.path import cwd_relative_path
from aihive._util.registry import (
    registry_log_name,
    registry_params,
)
from aihive.dataset import Dataset
from aihive.log import (
    EvalConfig,
    EvalDataset,
    EvalError,
    EvalPlan,
    EvalPlanStep,
    EvalResults,
    EvalRevision,
    EvalSample,
    EvalSpec,
    EvalStats,
)
from aihive.log._log import EvalLog, EvalSampleReductions
from aihive.log._recorders import Recorder
from aihive.model import (
    GenerateConfig,
    Model,
    ModelName,
)
from aihive.model._model import model_usage
from aihive.solver._plan import Plan
from aihive.solver._solver import Solver, SolverSpec
from aihive.util._sandbox.environment import SandboxEnvironmentSpec


class TaskLogger:
    def __init__(
        self,
        task_name: str,
        task_version: int,
        task_file: str | None,
        task_id: str | None,
        run_id: str,
        solver: SolverSpec | None,
        tags: list[str] | None,
        model: Model,
        dataset: Dataset,
        sandbox: SandboxEnvironmentSpec | None,
        task_attribs: dict[str, Any],
        task_args: dict[str, Any],
        model_args: dict[str, Any],
        eval_config: EvalConfig,
        metadata: dict[str, Any] | None,
        recorder: Recorder,
    ) -> None:
        # determine versions
        git = git_context()
        revision = (
            EvalRevision(type="git", origin=git.origin, commit=git.commit)
            if git
            else None
        )
        packages = {PKG_NAME: importlib_metadata.version(PKG_NAME)}

        # remove api_key from model_args
        model_args = model_args.copy()
        if "api_key" in model_args:
            del model_args["api_key"]

        # cwd_relative_path for sandbox config
        if sandbox and isinstance(sandbox.config, str):
            sandbox = SandboxEnvironmentSpec(
                sandbox.type, cwd_relative_path(sandbox.config)
            )

        # ensure that the dataset has sample ids and record them
        sample_ids = cast(
            list[int | str],
            [
                sample.id
                for sample in slice_dataset(
                    dataset, eval_config.limit, eval_config.sample_id
                )
            ],
        )

        # create eval spec
        self.eval = EvalSpec(
            run_id=run_id,
            created=iso_now(),
            task=f"{task_name}",
            task_id=task_id if task_id else uuid(),
            task_version=task_version,
            task_file=task_file,
            task_attribs=task_attribs,
            task_args=task_args,
            solver=solver.solver if solver else None,
            tags=tags,
            solver_args=solver.args if solver else None,
            model=str(ModelName(model)),
            model_base_url=model.api.base_url,
            dataset=EvalDataset(
                name=dataset.name,
                location=cwd_relative_path(dataset.location),
                samples=len(dataset),
                sample_ids=sample_ids,
                shuffled=dataset.shuffled,
            ),
            sandbox=sandbox,
            model_args=model_args,
            config=eval_config,
            revision=revision,
            packages=packages,
            metadata=metadata,
        )

        # stack recorder and location
        self.recorder = recorder

        # number of samples logged
        self._samples_completed = 0

        # size of flush buffer (how many samples we buffer before hitting storage)
        self.flush_buffer = eval_config.log_buffer or recorder.default_log_buffer()
        self.flush_pending = 0

    async def init(self) -> None:
        self._location = await self.recorder.log_init(self.eval)

    @property
    def location(self) -> str:
        return self._location

    @property
    def samples_completed(self) -> int:
        return self._samples_completed

    async def log_start(self, plan: EvalPlan) -> None:
        await self.recorder.log_start(self.eval, plan)

    async def log_sample(self, sample: EvalSample, *, flush: bool) -> None:
        # log the sample
        await self.recorder.log_sample(self.eval, sample)

        # flush if requested
        if flush:
            self.flush_pending += 1
            if self.flush_pending >= self.flush_buffer:
                await self.recorder.flush(self.eval)
                self.flush_pending = 0

        # track sucessful samples logged
        if sample.error is None:
            self._samples_completed += 1

    async def log_finish(
        self,
        status: Literal["success", "cancelled", "error"],
        stats: EvalStats,
        results: EvalResults | None = None,
        reductions: list[EvalSampleReductions] | None = None,
        error: EvalError | None = None,
    ) -> EvalLog:
        return await self.recorder.log_finish(
            self.eval, status, stats, results, reductions, error
        )


async def log_start(
    logger: TaskLogger,
    plan: Plan,
    config: GenerateConfig,
) -> None:
    def eval_plan_step(solver: Solver) -> EvalPlanStep:
        return EvalPlanStep(
            solver=registry_log_name(solver), params=registry_params(solver)
        )

    eval_plan = EvalPlan(
        name=plan.name,
        steps=[eval_plan_step(solver) for solver in plan.steps],
        finish=eval_plan_step(plan.finish) if plan.finish else None,
        config=config,
    )
    if plan.finish:
        eval_plan.steps.append(eval_plan_step(plan.finish))

    await logger.log_start(eval_plan)


def collect_eval_data(stats: EvalStats) -> None:
    # collect stats
    stats.completed_at = iso_now()
    stats.model_usage = model_usage()
