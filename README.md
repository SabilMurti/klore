# 🌌 Klore-Noir CLI

[![License: MIT](https://img.shields.io/badge/License-MIT-purple.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-1.0.0-blueviolet.svg)](#)

**Klore-Noir** is an AI-powered project template engine that turns any codebase into a reusable template in seconds. No more manual searching and replacing strings.

---

## ✨ Features

- 🔍 **Smart Scanning**: Deeply analyzes your project structure and tech stack.
- 🤖 **AI-Driven Extraction**: Uses LLMs (Ollama, OpenAI, Gemini) to intelligently find replaceable content.
- 📦 **One-Command Installation**: Deploy templates into new projects with interactive prompts.
- 🎨 **Unified UI**: Professional CLI interface with ASCII art and boxy prompts.
- ⚡ **Zero Config**: Works out of the box with intelligent defaults.

---

## 🚀 Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/SabilMurti/klore.git

# Go to CLI folder
cd klore-cli

# Install dependencies
npm install

# Link globally (optional)
npm link
```

### Usage

#### 1. Analyze a Project

Scan your project to see what Klore detects:

```bash
klore scan ./my-project
```

#### 2. Create a Template

Turn your project into a `.klore` template. Use the `--ai` flag for smart variable detection:

```bash
klore create ./my-project --ai
```

#### 3. Install a Template

Create a new project from an existing template:

```bash
klore install ./my-template -o ./new-project
```

---

## 🤖 AI Configuration

Klore supports multiple AI providers. Set your API keys in a `.env` file in the CLI directory:

```env
OPENAI_API_KEY=your_key
GEMINI_API_KEY=your_key
ANTHROPIC_API_KEY=your_key
OLLAMA_BASE_URL=http://localhost:11434
```

_Note: Ollama is supported out-of-the-box for local-first intelligence._

---

## 🛠️ Commands Reference

| Command   | Description                | Options                                   |
| :-------- | :------------------------- | :---------------------------------------- |
| `scan`    | Analyze project tech stack | `-v` (verbose)                            |
| `create`  | Create `.klore` template   | `--ai`, `--provider`, `--model`, `--scan` |
| `install` | Deploy template to project | `-o` (output), `--force`, `--defaults`    |
| `ai`      | Interactive AI Chat        | `-p` (provider), `-m` (model)             |

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  Built with 💜 by <a href="https://github.com/SabilMurti">SabilMurti</a>
</p>
