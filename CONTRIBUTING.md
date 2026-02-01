# Contributing to Rein

⭐ First off, thank you for considering contributing to Rein! ⭐

Rein is a cross-platform remote input controller that turns your phone into a wireless trackpad and keyboard. We welcome contributions from everyone!

## 🚨 IMPORTANT: Discord Communication is Mandatory

**All project communication MUST happen on Discord. We do not pay attention to GitHub notifications.**

- Join our [Discord server](https://discord.gg/hjUhu33uAn) before starting any work
- Post your PR/issue updates in the **AOSSIE-Discord/Projects/Rein** channel (**MANDATORY**)
- All discussions, questions, and updates should be on Discord
- GitHub is for code only - Discord is for communication

**PRs without Discord updates will not be reviewed or may face delays.**

## 📋 Table of Contents

- [How Can I Contribute?](#-how-can-i-contribute)
- [Getting Started](#-getting-started)
- [Development Workflow](#-development-workflow)
- [Pull Request Guidelines](#-pull-request-guidelines)
- [Code Style Guidelines](#-code-style-guidelines)
- [Platform-Specific Notes](#-platform-specific-notes)
- [Community Guidelines](#-community-guidelines)

## 🤝 How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates. When creating a bug report, include:

- Clear and descriptive title
- Steps to reproduce the issue
- Expected behavior vs actual behavior
- Screenshots/Video (if applicable)
- **Desktop OS** (especially note if using Wayland)
- **Mobile device/browser** used as controller
- Console logs from both server and browser

### Suggesting Features

Feature suggestions are welcome! Please:

- Check if the feature has already been suggested
- Provide a clear description of the feature
- Explain why this feature would be useful for remote input control
- Note which platforms it would affect

### Contributing Code

1. **Submit an Issue First**: For features, bugs, or enhancements, create an issue first
2. **Get Assigned**: Wait to be assigned before starting work (preferable)
3. **Submit Your PR**: Once assigned, create a PR addressing the issue
4. **Unrelated PRs**: Pull requests unrelated to issues may be closed or take longer to review

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18+ (LTS recommended)
- **npm** (comes with Node.js)
- A touchscreen device (phone/tablet) for manual testing
- Both devices on the **same Wi-Fi network**

### Setup

1. **Fork the Repository**
   ```bash
   # Click the 'Fork' button at the top right of this page
   ```

2. **Clone Your Fork**
   ```bash
   git clone https://github.com/YOUR_USERNAME/rein.git
   cd rein
   ```

3. **Add Upstream Remote**
   ```bash
   git remote add upstream https://github.com/AOSSIE-Org/rein.git
   ```

4. **Install Dependencies**
   ```bash
   npm install
   ```

5. **Run the Development Server**
   ```bash
   npm run dev
   ```

6. **Test the Connection**
   - Open `http://localhost:3000/settings` on your desktop
   - Scan the QR code with your phone OR enter `http://<YOUR_IP>:3000/trackpad`
   - Verify cursor movement works

## 🔄 Development Workflow

### 1. Create a Feature Branch

Always work on a new branch, never on `main`:

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

**Branch naming examples:**
- `feature/wayland-uinput-support`
- `fix/cursor-desync-kde`
- `feat/media-key-support`
- `docs/update-architecture`

### 2. Make Your Changes

- Write clean, readable TypeScript code
- Follow the project's code style (enforced by Biome)
- Add comments for complex input handling logic
- Update documentation if changing behavior

### 3. Verify Your Changes

```bash
# Check for linting issues
npx biome check .

# Start the dev server and test manually
npm run dev
```

**Manual testing checklist:**
- [ ] Cursor movement works smoothly
- [ ] Click events (left, right, middle) work
- [ ] Scrolling works (single finger in scroll mode, two-finger)
- [ ] Keyboard input works (characters, special keys)
- [ ] Connection is stable (no disconnects)

### 4. Commit Your Changes

Write clear, concise commit messages:

```bash
git add .
git commit -m "feat: add gesture customization"
# or
git commit -m "fix: resolve cursor desync on Wayland"
```

**Commit Message Format:**
- `feat:` for new features
- `fix:` for bug fixes
- `docs:` for documentation changes
- `style:` for formatting changes
- `refactor:` for code refactoring
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

- [ ] Your code follows the project's style guidelines
- [ ] You've manually tested your changes
- [ ] You've updated relevant documentation
- [ ] Your commits are clean and well-organized
- [ ] You've rebased with the latest upstream changes

### Submitting a Pull Request

1. Go to the original repository on GitHub
2. Click "New Pull Request"
3. Select your fork and branch
4. Fill out the PR template completely
5. **Post your PR link on Discord** (mandatory!)

### After Submission

- Respond to review comments promptly
- Make requested changes in new commits
- Be patient - maintainers will review when available

## 📝 Code Style Guidelines

This project uses **Biome** for linting and formatting. Configuration is in `biome.json`.

Run the linter before committing:
```bash
npx biome check .
```

### TypeScript Guidelines

- Use ES6+ syntax
- Prefer `const` over `let`, avoid `var`
- Use proper TypeScript types, avoid `any`
- Use arrow functions where appropriate
- Add JSDoc comments for exported functions

### React Guidelines

- Use functional components with hooks
- Keep components focused and reusable
- Use TanStack Router conventions for routing
- Store touch gesture logic in custom hooks

### Server-Side Guidelines

- Keep WebSocket message handlers clean and focused
- Log errors with meaningful context
- Handle edge cases gracefully (disconnections, invalid input)

## 🖥️ Platform-Specific Notes

Rein uses **nut.js** for input simulation, which has platform-specific behavior.

### Windows

- ✅ Works out of the box
- May require firewall rule for port 3000
- Uses native Windows input APIs

### macOS

- Requires Accessibility permissions:
  - System Preferences → Security & Privacy → Privacy → Accessibility
  - Add Terminal or your IDE
- Uses Quartz Event Services

### Linux (X11)

- ✅ Should work without issues
- Uses XTest extension for input simulation

### Linux (Wayland)

⚠️ **Known Issues - Priority Improvement Area:**
- Cursor position may desync due to XWayland isolation
- nut.js uses X11 APIs which Wayland doesn't fully support

**If you're working on Wayland support:**
```bash
# Check if you're on Wayland
echo $XDG_SESSION_TYPE  # Should print "wayland"

# Check if uinput is available (for potential fixes)
ls -la /dev/uinput
```

**Potential solutions being explored:**
- `uinput` virtual input devices
- `libei` (Wayland input emulation)
- `ydotool` as a fallback

## 🌟 Community Guidelines

### Communication

- Be respectful and inclusive
- Provide constructive feedback
- Help others when you can
- Ask questions - no question is too small!

### Progress Updates

- If your work is taking longer than expected, update on Discord
- Issues should be completed within 5-30 days depending on complexity
- If you can no longer work on an issue, let maintainers know on Discord

### Getting Help

- Check the [Project Wiki](https://github.com/imxade/rein/wiki) first
- Search closed issues for similar problems
- Ask in Discord
- Tag maintainers on Discord if your PR is unattended for 1-2 weeks

## 🎯 Issue Assignment

- One contributor per issue (unless specified otherwise)
- Wait for assignment before starting work
- Issues will be reassigned if inactive for extended periods
- Check for existing PRs before starting to avoid duplication

---

## ✨ Maintainers

- [@imxade](https://github.com/imxade) (Rituraj)

---

Thank you for contributing to Rein! Your efforts help make remote input control better for everyone. 🚀

© 2026 AOSSIE
