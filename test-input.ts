import { down, left, mouse, right, up } from "@nut-tree-fork/nut-js";

(async () => {
	console.log("Moving mouse in a square pattern...");
	const center = await mouse.getPosition();
	console.log(`Start Pos: ${center.x}, ${center.y}`);
	const size = 100;

	// nut.js moves are async
	await mouse.move(right(size));
	await mouse.move(down(size));
	await mouse.move(left(size));
	await mouse.move(up(size));

	console.log("Square complete!");
})();
