# Contributing to Rein

⭐ First off, thank you for considering contributing to this project! ⭐

We welcome contributions from everyone. By participating in this project, you agree to abide by our Code of Conduct.

## 🚨 IMPORTANT: Discord Communication is Mandatory

**All project communication MUST happen on Discord. We do not pay attention to GitHub notifications.**

- Join our [Discord server](https://discord.com/invite/C8wHmwtczs) before starting any work (Go to Project -> Rein)
- Post your PR/issue updates in the relevant Discord channel (**MANDATORY**)
- All discussions, questions, and updates should be on Discord
- GitHub is for code only - Discord is for communication

**PRs without Discord updates will not be reviewed or may face delays.**

## 📑 Table of Contents

- [How Can I Contribute?](#how-can-i-contribute)
- [Coding with AI](#coding-with-ai)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Pull Request Guidelines](#pull-request-guidelines)
- [Code Style Guidelines](#code-style-guidelines)
- [Community Guidelines](#community-guidelines)

## 🤝 How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates. When creating a bug report, include:

- Clear and descriptive title
- Steps to reproduce the issue
- Expected behavior vs actual behavior
- Screenshots/Video (if applicable)
- Environment details (OS, browser, versions, etc.)

### Suggesting Features

Feature suggestions are welcome! Please:

- Check if the feature has already been suggested
- Provide a clear description of the feature
- Explain why this feature would be useful
- Include examples of how it would work

### Contributing Code

1. **Submit an Issue First**: For features, bugs, or enhancements, create an issue first
2. **Get Assigned**: Wait to be assigned before starting work(preferable)
3. **Submit Your PR**: Once assigned, create a PR addressing the issue
4. **Unrelated PRs**: Pull requests unrelated to issues may be closed or take longer to review

## 🤖 Coding with AI

We accept the use of AI-powered tools (GitHub Copilot, ChatGPT, Claude, Cursor, etc.) for contributions, whether for code, tests, or documentation.

⚠️ However, transparency is required: if you use AI assistance, please mention it in your PR description. This helps maintainers during code review and ensure the quality of contributions.

What we expect:
- **Disclose AI usage**: A simple note like "Used GitHub Copilot for autocompletion" or "Generated initial test structure with ChatGPT" is sufficient.
- **Specify the scope**: Indicate which parts of your contribution involved AI assistance.
- **Review AI-generated content**: Ensure you understand and have verified any AI-generated code before submitting.
- **Understand the code**: Understand the project beyond what an LLM can provide. PR count is less important than real understanding. Do not let LLMs define the "how".
- **Avoid AI bounties**: Avoid LLM suggested bounties.
- **Review AI suggestions carefully**: Be careful when addressing changes suggested by CodeRabbit, as they can be problematic.

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- npm (comes with Node.js)
- Access to Windows, Linux Wayland, and macOS (either on bare metal or via VM) is mandatory to fully test the app's cross-platform functionality.

### Setup

1. **Star the Repository**
   Please leave a star ⭐ to show your support and make the project more visible to others!

2. **Fork the Repository**
   ```bash
   # Click the 'Fork' button at the top right of this page
   ```

3. **Clone Your Fork**
   ```bash
   git clone https://github.com/YOUR_USERNAME/Rein.git
   cd Rein
   ```

4. **Add Upstream Remote**
   ```bash
   git remote add upstream https://github.com/AOSSIE-Org/Rein.git
   ```

5. **Install Dependencies**
   ```bash
   npm install
   ```

6. **Run the Project**
   ```bash
   npm run dev
   ```

## 🔄 Development Workflow

### 1. Create a Feature Branch

Always work on a new branch, never on `main` or `dev`:

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

### 2. Make Your Changes

- Write clean, readable code
- Follow the project's code style (Biome)
- Add comments where necessary
- Update documentation if needed

### 3. Test & Format Your Changes

We use Vitest for testing and Biome for formatting/linting:

```bash
# Run tests
npm run test

# Format code
npm run format

# Lint code
npm run lint
```

### 4. Commit Your Changes

Write clear, concise commit messages:

```bash
git add .
git commit -m "feat: add user authentication"
# or
git commit -m "fix: resolve navigation bug"
```

**Commit Message Format:**
- `feat:` for new features
- `fix:` for bug fixes
- `docs:` for documentation changes
- `style:` for formatting changes
- `refactor:` for code refactoring
- `test:` for adding tests
- `chore:` for maintenance tasks

### 5. Keep Your Branch Updated

```bash
git fetch upstream
git rebase upstream/main
```

### 6. Push Your Changes

```bash
git push origin feature/your-feature-name
```

## 📤 Pull Request Guidelines

### Before Submitting

- [ ] Your code follows the project's style guidelines (`npm run format`, `npm run lint`)
- [ ] You've tested your changes thoroughly (`npm run test`)
- [ ] You've updated relevant documentation
- [ ] Your commits are clean and well-organized
- [ ] You've rebased with the latest upstream changes
- [ ] You've thought from the reviewer's perspective and made your PR easy to review

### Submitting a Pull Request

1. Go to the original repository on GitHub
2. Click "New Pull Request"
3. Select your fork and branch
4. Fill out the PR template with:
   - Clear description of changes
   - Link to related issue(s)
   - Screenshots (if UI changes)
   - Testing steps

### PR Description Template

```markdown
## Description
Brief description of what this PR does

## Related Issue
Closes #issue_number

## Screenshots/Video (if applicable)
Add screenshots here

## Testing (if applicable)
Steps to test the changes

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] Tests added/updated
- [ ] If submitting a new feature/behavior, it is added to the PR template functionality checklist
```

### After Submission

- Post your PR in the project's Discord channel for visibility (**IMPORTANT**)
- Respond to review comments promptly
- Make requested changes in new commits
- Be patient - maintainers will review when available
- Convert incomplete PRs into draft, but focus on finishing one change properly before moving to another. Gatekeeping is not appreciated.

### Reviewing PRs

- Instead of opening duplicate PRs, review and improve existing ones.
- When reviewing, assess whether the change is truly necessary before diving into implementation details and functionality testing.
- Mark duplicate issues and PRs, and reference the original ones.

## 📝 Code Style Guidelines

The project uses [Biome](https://biomejs.dev/) for formatting and linting. 

### General Guidelines

- Run `npm run format` and `npm run lint` before committing your code.
- Use meaningful variable and function names.
- Keep functions small and focused.
- Add comments for complex logic.
- Remove `console.log`s before committing.
- Avoid code duplication.
- Avoid unnecessary complexity, minor over-optimization, and hardcoded values.
- **Priority**: Simplicity, modularity, and realtime behavior (i.e. failure over delay) is the priority.

### TypeScript / React

- Use ES6+ syntax.
- Prefer `const` over `let`, avoid `var`.
- Use arrow functions where appropriate.
- Follow Biome's linting rules.
- Maintain type safety; avoid using `any` when possible.

## 🌟 Community Guidelines

### Communication

- Be respectful and inclusive
- Provide constructive feedback
- Help others when you can
- Ask questions - no question is too small!

### Progress Updates

- If your work is taking longer than expected, comment on the discord with updates
- Issues should be completed within 5-30 days depending on complexity
- If you can no longer work on an issue, let maintainers know on discord

### Getting Help

- Check existing documentation first
- Search closed issues for similar problems
- Ask in Discord 
- Tag maintainers if your PR is unattended for 1-2 weeks on discord

## 🎯 Issue Assignment

- One contributor per issue (unless specified otherwise)
- Do not ask for assignment. If an issue has no PR activity for 2+ days, and you have the clarity to handle it, share your approach under the issue and begin.
- Avoid working on issues which are assigned to someone, even if they are inactive
- Check for existing PRs before starting to avoid duplication, as there might be PRs that didn't mention the related issue
- Check pinned issues for issues needing immediate attention.
- Avoid working on issues labeled as "questions" unless there is a justified urgent need.
- Issues currently locked are mainly for GSoC, aiming for working prototypes before going ahead with a defined way. This prototype/video should be shared in discord channel for feedback.

### Core Values & Contributor Goals
- **Long-Term Focus:** We are looking for long-term maintainers, not just GSoC participants. Initiative and the ability to guide others matter.

Thank you for contributing to Rein! Your efforts help make this project better for everyone. 🚀