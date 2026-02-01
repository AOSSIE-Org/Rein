# Contributing to Rein!..

⭐ First off, thank you for considering contributing to this project! ⭐

We welcome contributions from everyone. By participating in this project, you agree to abide by our Code of Conduct.

##   IMPORTANT: Discord Communication is Mandatory

**All project communication MUST happen on Discord. We do not pay attention to GitHub notifications.**

- Join our [Discord server](https://discord.gg/hjUhu33uAn) before starting any work
- Post your PR/issue updates in the relevant Discord channel (**MANDATORY**)
- All discussions, questions, and updates should be on Discord
- GitHub is for code only - Discord is for communication

**PRs without Discord updates will not be reviewed or may face delays.**

##  📋 Table of Contents

- [How Can I Contribute?](#how-can-i-contribute)
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


## 🚀 Getting Started

### Prerequisites

- Node.js (LTS)
- npm

### Setup

1. **Fork the Repository**
   ```bash
   # Click the 'Fork' button at the top right of this page
   ```

2. **Clone Your Fork**
   ```bash
   https://github.com/AOSSIE-Org/Rein.git
    cd Rein
   ```

3. **Add Upstream Remote**
   ```bash
  git remote add upstream https://github.com/AOSSIE-Org/Rein.git
   ```

4. **Install Dependencies**
   ```bash
   npm install
   # or yarn install
   # or pnpm install
   ```

5. **Run the Project**
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
- Follow the project's code style
- Add comments where necessary
- Update documentation if needed

### 3. Test Your Changes

Currently, no automated test suite is configured for this project.

```bash
npm test
# or
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
# or upstream/dev depending on the project
```

### 6. Push Your Changes

```bash
git push origin feature/your-feature-name
```

## 📤 Pull Request Guidelines

### Before Submitting

- [ ] Your code follows the project's style guidelines
- [ ] You've tested your changes thoroughly
- [ ] You've updated relevant documentation
- [ ] Your commits are clean and well-organized
- [ ] You've rebased with the latest upstream changes

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

## Testing(if applicable)
Steps to test the changes

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] Tests added/updated
```

### After Submission

- Post your PR in the project's Discord channel for visibility(**IMPORTANT**)
- Respond to review comments promptly
- Make requested changes in new commits
- Be patient - maintainers will review when available

## 📝 Code Style Guidelines

This project follows standard TypeScript and frontend best practices and uses Biome/ESLint configuration present in the repository.

### General Guidelines

- Use meaningful variable and function names
- Keep functions small and focused
- Add comments for complex logic
- Remove console.logs before committing
- Avoid code duplication

### JavaScript/TypeScript
- Use ES6+ syntax
- Prefer `const` over `let`, avoid `var`
- Use arrow functions where appropriate
- Follow ESLint rules

### Python
- Follow PEP 8 style guide
- Use type hints where applicable
- Write docstrings for functions/classes

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
- Wait for assignment before starting work
- Issues will be reassigned if inactive for extended periods
- Check for existing PRs before starting to avoid duplication


Thank you for contributing to Rein Your efforts help make this project better for everyone. 🚀
