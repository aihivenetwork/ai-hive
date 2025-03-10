
Welcome to aihive, a framework for large language model evaluations created by the [Optus AI](https://aihive.network/).

aihive provides many built-in components, including facilities for prompt engineering, tool usage, multi-turn dialog, and model graded evaluations. Extensions to aihive (e.g. to support new elicitation and scoring techniques) can be provided by other Python packages.

To get started with aihive, please see the documentation at <https://aihive.network/>.

***



To work on development of aihive, clone the repository and install with the `-e` flag and `[dev]` optional dependencies:

```bash
$ git clone https://github.com/aihivenetwork
$ cd optus-ai
$ pip install -e ".[dev]"
```

Optionally install pre-commit hooks via
```bash
make hooks
```

Run linting, formatting, and tests via
```bash
make check
make test
```

If you use VS Code, you should be sure to have installed the recommended extensions (Python, Ruff, and MyPy). Note that you'll be prompted to install these when you open the project in VS Code.
