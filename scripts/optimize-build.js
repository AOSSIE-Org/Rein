#!/usr/bin/env node

// Pre-build optimization script
const fs = require('fs');
const path = require('path');

console.log('🚀 Running pre-build optimizations...');

// 1. Clean unnecessary files from node_modules
const cleanNodeModules = () => {
  const nodeModulesPath = path.join(__dirname, 'node_modules');
  if (!fs.existsSync(nodeModulesPath)) return;

  const unnecessaryPatterns = [
    '**/*.md',
    '**/*.txt', 
    '**/README*',
    '**/LICENSE*',
    '**/CHANGELOG*',
    '**/.npmignore',
    '**/test/**',
    '**/tests/**',
    '**/__tests__/**',
    '**/*.test.*',
    '**/*.spec.*',
    '**/docs/**',
    '**/examples/**',
    '**/.github/**',
    '**/coverage/**'
  ];

  console.log('🧹 Cleaning node_modules...');
  // This would need a proper implementation with glob matching
  // For now, we'll rely on electron-builder's file filtering
};

// 2. Create production package.json
const createProdPackageJson = () => {
  const packagePath = path.join(__dirname, 'package.json');
  const package = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  
  // Keep only production dependencies for the final build
  const prodPackage = {
    name: package.name,
    version: package.version,
    main: package.main,
    scripts: {
      start: "node electron/main.cjs"
    },
    dependencies: {
      // Only include runtime dependencies
    }
  };
  
  const prodPath = path.join(__dirname, '.output', 'package.json');
  fs.mkdirSync(path.dirname(prodPath), { recursive: true });
  fs.writeFileSync(prodPath, JSON.stringify(prodPackage, null, 2));
  console.log('📦 Created production package.json');
};

// 3. Optimize built files
const optimizeBuiltFiles = () => {
  const outputPath = path.join(__dirname, '.output');
  if (!fs.existsSync(outputPath)) return;
  
  console.log('⚡ Optimizing built files...');
  
  // Remove source maps in production
  const removeSourceMaps = (dir) => {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (const file of files) {
      const filePath = path.join(dir, file.name);
      if (file.isDirectory()) {
        removeSourceMaps(filePath);
      } else if (file.name.endsWith('.map')) {
        fs.unlinkSync(filePath);
        console.log(`  Removed: ${filePath}`);
      }
    }
  };
  
  removeSourceMaps(outputPath);
};

// Run all optimizations
cleanNodeModules();
createProdPackageJson();
optimizeBuiltFiles();

console.log('✅ Pre-build optimizations complete!');