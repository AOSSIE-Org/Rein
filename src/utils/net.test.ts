import os from "node:os"
import { afterEach, describe, expect, it, vi } from "vitest"
import { getAuthHeaders, getLanIp, isLoopbackAddress } from "./net"

describe("isLoopbackAddress", () => {
	it("recognizes all loopback forms", () => {
		expect(isLoopbackAddress("127.0.0.1")).toBe(true)
		expect(isLoopbackAddress("::1")).toBe(true)
		expect(isLoopbackAddress("::ffff:127.0.0.1")).toBe(true)
	})

	it("rejects non-loopback and empty inputs", () => {
		expect(isLoopbackAddress("192.168.1.5")).toBe(false)
		expect(isLoopbackAddress("")).toBe(false)
		expect(isLoopbackAddress(null)).toBe(false)
		expect(isLoopbackAddress(undefined)).toBe(false)
	})
})

describe("getAuthHeaders", () => {
	it("returns an empty object when no token is given", () => {
		expect(getAuthHeaders()).toEqual({})
		expect(getAuthHeaders("")).toEqual({})
	})

	it("returns a Bearer header when a token is given", () => {
		expect(getAuthHeaders("abc123")).toEqual({
			Authorization: "Bearer abc123",
		})
	})
})

describe("getLanIp", () => {
	afterEach(() => {
		vi.restoreAllMocks()
	})

	const iface = (address: string, extra = {}) => ({
		address,
		family: "IPv4" as const,
		internal: false,
		netmask: "255.255.255.0",
		mac: "00:00:00:00:00:00",
		cidr: `${address}/24`,
		...extra,
	})

	it("falls back to 127.0.0.1 when no external IPv4 interface exists", () => {
		vi.spyOn(os, "networkInterfaces").mockReturnValue({})
		expect(getLanIp()).toBe("127.0.0.1")
	})

	it("skips internal interfaces in favor of an external one", () => {
		vi.spyOn(os, "networkInterfaces").mockReturnValue({
			eth0: [iface("192.168.1.2", { internal: true })],
			eth1: [iface("192.168.1.3")],
		})
		expect(getLanIp()).toBe("192.168.1.3")
	})

	it("prefers a physical interface over a virtual one", () => {
		vi.spyOn(os, "networkInterfaces").mockReturnValue({
			"vEthernet (WSL)": [iface("172.20.0.1")],
			"Wi-Fi": [iface("192.168.1.42")],
		})
		expect(getLanIp()).toBe("192.168.1.42")
	})

	it("penalizes known virtual subnet prefixes", () => {
		vi.spyOn(os, "networkInterfaces").mockReturnValue({
			eth0: [iface("192.168.56.1")],
			eth1: [iface("192.168.1.10")],
		})
		expect(getLanIp()).toBe("192.168.1.10")
	})
})
