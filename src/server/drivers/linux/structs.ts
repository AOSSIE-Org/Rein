import koffi from "koffi"

export const InputEvent = koffi.struct("input_event", {
	tv_sec: "int64",
	tv_usec: "int64",
	type: "uint16",
	code: "uint16",
	value: "int32",
})

export const UinputSetup = koffi.struct("uinput_setup", {
	bustype: "uint16",
	vendor: "uint16",
	product: "uint16",
	version: "uint16",
	name: koffi.array("char", 80),
	ff_effects_max: "uint32",
})

export const InputAbsinfo = koffi.struct("input_absinfo", {
	value: "int32",
	minimum: "int32",
	maximum: "int32",
	fuzz: "int32",
	flat: "int32",
	resolution: "int32",
})

export const UinputAbsSetup = koffi.struct("uinput_abs_setup", {
	code: "uint16",
	__pad: "uint16",
	__pad2: "uint32",
	absinfo: InputAbsinfo,
})

type KoffiLib = ReturnType<typeof koffi.load>
type KoffiFunc = ReturnType<KoffiLib["func"]>

let _libc: KoffiLib | null = null
let _open: KoffiFunc | null = null
let _close: KoffiFunc | null = null
let _write: KoffiFunc | null = null
let _ioctl: KoffiFunc | null = null
let _dummyBuffer: Buffer | null = null

function ensureLibc() {
	if (!_libc) {
		_libc = koffi.load("libc.so.6")

		_open = _libc.func("int open(const char *pathname, int flags, ...)")
		_close = _libc.func("int close(int fd)")
		_write = _libc.func(
			"int64 write(int fd, const input_event *buf, size_t count)",
		)
		_ioctl = _libc.func("int ioctl(int fd, unsigned long request, ...)")
		_dummyBuffer = Buffer.alloc(1)
	}
}

const O_WRONLY = 0x1
const O_NONBLOCK = 0x800
export const INPUT_EVENT_SIZE = koffi.sizeof(InputEvent)

export function openUinput(path: string): number {
	ensureLibc()
	if (!_open) {
		throw new Error("libc not initialized")
	}
	const fd = _open(path, O_WRONLY | O_NONBLOCK) as number
	if (fd < 0) {
		throw new Error(
			`Failed to open ${path}, got fd ${fd} (check permissions and /dev/uinput availability)`,
		)
	}
	return fd
}

export function closeUinput(fd: number): void {
	ensureLibc()
	if (!_close) {
		throw new Error("libc not initialized")
	}
	_close(fd)
}

export function writeEvent(
	fd: number,
	type: number,
	code: number,
	value: number,
): boolean {
	ensureLibc()
	const ev = { tv_sec: 0n, tv_usec: 0n, type, code, value }
	if (!_write) {
		throw new Error("libc not initialized")
	}
	const written = _write(fd, ev, INPUT_EVENT_SIZE) as number
	return written === INPUT_EVENT_SIZE
}
/**
 * Perform an ioctl call with an integer argument.
 * `@returns` 0 on success, -1 on error (check errno via native means if needed)
 */
export function ioctlInt(fd: number, request: number, value: number): number {
	ensureLibc()
	if (!_ioctl) {
		throw new Error("libc not initialized")
	}
	return _ioctl(fd, request, "int", value) as number
}

export function ioctlStruct(
	fd: number,
	request: number,
	typeName: string,
	data: unknown,
): number {
	ensureLibc()
	if (!_ioctl) {
		throw new Error("libc not initialized")
	}
	return _ioctl(fd, request, typeName, data) as number
}

export function ioctlNull(fd: number, request: number): number {
	ensureLibc()
	if (!_ioctl) {
		throw new Error("libc not initialized")
	}
	return _ioctl(fd, request, "void *", 0) as number
}
