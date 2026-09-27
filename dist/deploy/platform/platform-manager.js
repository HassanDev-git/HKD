"use strict";
/**
 * HKD Platform Adapter Abstraction & Registry
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlatformRegistry = void 0;
class PlatformRegistry {
    adapters = new Map();
    register(adapter) {
        this.adapters.set(adapter.id, adapter);
    }
    get(id) {
        return this.adapters.get(id);
    }
    getAll() {
        return Array.from(this.adapters.values());
    }
    async detectActive(projectDir) {
        const active = [];
        for (const a of this.adapters.values()) {
            if (await a.detect(projectDir)) {
                active.push(a);
            }
        }
        return active;
    }
}
exports.PlatformRegistry = PlatformRegistry;
//# sourceMappingURL=platform-manager.js.map