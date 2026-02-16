import { mouse, Point, keyboard, Key } from '@nut-tree-fork/nut-js';
import { InputHandler } from './src/server/InputHandler';
import { RateLimiter } from './src/server/middleware/RateLimiter';
import { InputValidator } from './src/server/middleware/InputValidator';
import { InputSanitizer } from './src/server/middleware/InputSanitizer';

const handler = new InputHandler();
const rateLimiter = new RateLimiter();
const validator = new InputValidator();
const sanitizer = new InputSanitizer();

const clientId = 'test-client';

/**
 * Helper to simulate the full server-side processing pipeline
 */
async function processMessage(msg: any) {
    // Layer 1: Rate limiting (Per-client/Per-type)
    if (!rateLimiter.shouldProcess(clientId, msg.type)) {
        console.log(`[Throttle] Dropped: ${msg.type}`);
        return false;
    }

    // Layer 2: Schema and Type Validation
    if (!validator.isValid(msg)) {
        console.log(`[Validator] Rejected Invalid: ${msg.type}`);
        return false;
    }

    // Layer 3: Bounds and Length Sanitization
    sanitizer.sanitize(msg);

    // Final execution on the host machine
    await handler.handleMessage(msg);
    return true;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

console.log("Starting Shield Security and Performance Tests...\n");

(async () => {
    // TEST 1: Rate Limiting
    console.log("TEST 1: Rate Limiting - Move Events");
    console.log("Status: Dispatching 100 move events...");
    
    let processed = 0;
    const startTime = Date.now();
    
    for (let i = 0; i < 100; i++) {
        const result = await processMessage({ type: 'move', dx: 1, dy: 0 });
        if (result) processed++;
    }
    
    const duration = Date.now() - startTime;
    console.log(`Summary: Processed ${processed}/100 in ${duration}ms`);
    console.log(`Analysis: Expected approx 6 events for 60fps logic`);
    console.log("");

    await sleep(1000);

    // TEST 1.5: Scroll Throttling
    console.log("TEST 1.5: Scroll Throttling");
    console.log("Status: Dispatching 50 scroll events...");
    let scrollsProcessed = 0;
    for (let i = 0; i < 50; i++) {
        // Updated to include both axes to satisfy Validator schema
        const result = await processMessage({ type: 'scroll', dx: 0, dy: 1 });
        if (result) scrollsProcessed++;
    }
    console.log(`Summary: Processed ${scrollsProcessed}/50`);
    console.log(`Analysis: Expected approx 3 events to match move throttle`);
    console.log("");

    await sleep(1000);

    // TEST 2: Text Truncation
    console.log("TEST 2: Text Length Sanitization");
    
    const longText = 'A'.repeat(5000);
    const textMsg = { type: 'text', text: longText };
    
    console.log(`Original: ${textMsg.text.length} characters`);
    sanitizer.sanitize(textMsg);
    console.log(`Sanitized: ${textMsg.text.length} characters`);
    console.log(`Result: ${textMsg.text.length === 1000 ? 'SUCCESS' : 'FAILURE'}`);
    console.log("");

    await sleep(1000);

    // TEST 3: Coordinate Clamping
    console.log("TEST 3: Coordinate Clamping");
    
    const hugeMove = { type: 'move', dx: 999999, dy: -999999 };
    console.log(`Input: dx=${hugeMove.dx}, dy=${hugeMove.dy}`);
    
    sanitizer.sanitize(hugeMove);
    console.log(`Output: dx=${hugeMove.dx}, dy=${hugeMove.dy}`);
    console.log(`Result: ${hugeMove.dx === 5000 && hugeMove.dy === -5000 ? 'SUCCESS' : 'FAILURE'}`);
    console.log("");

    await sleep(1000);

    // TEST 4: Invalid Input Rejection
    console.log("TEST 4: Invalid Input Validation");
    
    const invalidInputs = [
        { type: 'move', dx: NaN, dy: 5 },
        { type: 'move', dx: Infinity, dy: 0 },
        { type: 'text', text: 123 },
        { type: 'click', button: 'invalid' },
        { type: 'combo', keys: 'not-an-array' },
        { type: 'invalid-type' },
    ];

    let rejected = 0;
    for (const msg of invalidInputs) {
        if (!validator.isValid(msg)) {
            rejected++;
        }
    }

    console.log(`Summary: Rejected ${rejected}/${invalidInputs.length} inputs`);
    console.log(`Result: ${rejected === invalidInputs.length ? 'SUCCESS' : 'FAILURE'}`);
    console.log("");

    await sleep(1000);

    // TEST 5: Valid Inputs Still Work
    console.log("TEST 5: Valid Input Persistence");
    
    const validInputs = [
        { type: 'move', dx: 10, dy: 10 },
        { type: 'click', button: 'left', press: true },
        { type: 'text', text: 'Hello' },
        { type: 'scroll', dx: 5, dy: -5 },
        { type: 'combo', keys: ['ctrl', 'c'] },
    ];

    let validCount = 0;
    for (const msg of validInputs) {
        if (validator.isValid(msg)) {
            validCount++;
        }
    }

    console.log(`Summary: Accepted ${validCount}/${validInputs.length} inputs`);
    console.log(`Result: ${validCount === validInputs.length ? 'SUCCESS' : 'FAILURE'}`);
    console.log("");

    await sleep(1000);

    // TEST 6: Combo Key Array Limit
    console.log("TEST 6: Keyboard Combo Array Limit");
    
    const hugeCombo = { type: 'combo', keys: Array(50).fill('a') };
    console.log(`Original: ${hugeCombo.keys.length} keys`);
    
    sanitizer.sanitize(hugeCombo);
    console.log(`Sanitized: ${hugeCombo.keys.length} keys`);
    console.log(`Result: ${hugeCombo.keys.length === 10 ? 'SUCCESS' : 'FAILURE'}`);
    console.log("");

    await sleep(1000);

    // TEST 7: Zoom Delta Clamping
    console.log("TEST 7: Zoom Delta Clamping");
    
    const hugeZoom = { type: 'zoom', delta: 999 };
    console.log(`Input: ${hugeZoom.delta}`);
    
    sanitizer.sanitize(hugeZoom);
    console.log(`Output: ${hugeZoom.delta}`);
    console.log(`Result: ${hugeZoom.delta === 100 ? 'SUCCESS' : 'FAILURE'}`);
    console.log("");

    await sleep(1000);

    // TEST 8: Click Throttling
    console.log("TEST 8: Click Event Throttling");
    console.log("Status: Dispatching 30 click events...");
    
    let clicksProcessed = 0;
    const clickStart = Date.now();
    
    for (let i = 0; i < 30; i++) {
        const result = await processMessage({ type: 'click', button: 'left', press: true });
        if (result) clicksProcessed++;
    }
    
    const clickDuration = Date.now() - clickStart;
    console.log(`Summary: Processed ${clicksProcessed}/30 in ${clickDuration}ms`);
    console.log(`Analysis: Expected approx 2-4 events for 50ms interval`);
    console.log("");

    await sleep(1000);

    // TEST 9: Domain Isolation
    console.log("TEST 9: Independent Throttling Per Type");
    
    const moveResult = await processMessage({ type: 'move', dx: 1, dy: 1 });
    const clickResult = await processMessage({ type: 'click', button: 'left', press: true });
    const textResult = await processMessage({ type: 'text', text: 'test' });
    
    console.log(`Move: ${moveResult ? 'PASS' : 'FAIL'}`);
    console.log(`Click: ${clickResult ? 'PASS' : 'FAIL'}`);
    console.log(`Text: ${textResult ? 'PASS' : 'FAIL'}`);
    console.log(`Result: ${moveResult && clickResult && textResult ? 'SUCCESS' : 'FAILURE'}`);
    console.log("");
    console.log("Integrated Security and Performance Tests Complete");
   

})();