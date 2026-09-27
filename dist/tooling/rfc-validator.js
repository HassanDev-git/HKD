"use strict";
/**
 * HKD RFC Validator & Tooling
 *
 * Implements: hkd rfc list | check | status
 * Inspects, parses, and verifies RFC proposals in the `rfcs/` directory.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RfcValidator = exports.MANDATORY_RFC_SECTIONS = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
exports.MANDATORY_RFC_SECTIONS = [
    "Summary",
    "Motivation",
    "Detailed Design",
    "Drawbacks",
    "Compatibility",
];
class RfcValidator {
    rfcsDir;
    constructor(rfcsDir) {
        this.rfcsDir = rfcsDir;
    }
    getAllRfcs() {
        if (!fs.existsSync(this.rfcsDir)) {
            return [];
        }
        const files = fs
            .readdirSync(this.rfcsDir)
            .filter((f) => /^\d{3}-.*\.md$/.test(f) && !f.startsWith("0000"))
            .sort();
        return files.map((f) => this.parseRfc(path.join(this.rfcsDir, f)));
    }
    parseRfc(filePath) {
        const content = fs.readFileSync(filePath, "utf-8");
        const basename = path.basename(filePath);
        const idMatch = basename.match(/^(\d+)/);
        const id = idMatch ? idMatch[1] : basename.replace(".md", "");
        // Extract title from first markdown header
        const titleMatch = content.match(/^#\s+(.+)$/m);
        const title = titleMatch ? titleMatch[1].replace(/RFC\s*\d*:\s*/i, "").trim() : basename;
        // Extract status
        let status = "Proposed";
        if (/status[:\s]+accepted/i.test(content))
            status = "Accepted";
        else if (/status[:\s]+experimental/i.test(content))
            status = "Experimental";
        else if (/status[:\s]+implemented/i.test(content))
            status = "Implemented";
        else if (/status[:\s]+draft/i.test(content))
            status = "Draft";
        // Extract target edition
        let targetEdition = "2027";
        const editionMatch = content.match(/edition[:\s]+"?(\d{4})"?/i);
        if (editionMatch)
            targetEdition = editionMatch[1];
        // Detect sections
        const headerMatches = content.matchAll(/^#{2,3}\s+(.+)$/gm);
        const sections = [];
        for (const m of headerMatches) {
            sections.push(m[1].trim());
        }
        const sectionSynonyms = {
            Summary: ["summary"],
            Motivation: ["motivation"],
            "Detailed Design": ["detailed design", "reference-level", "guide-level"],
            Drawbacks: ["drawbacks", "alternatives", "alternatives considered"],
            Compatibility: ["compatibility", "backward compatibility"],
        };
        const missingSections = [];
        for (const req of exports.MANDATORY_RFC_SECTIONS) {
            const syns = sectionSynonyms[req] ?? [req.toLowerCase()];
            const found = sections.some((s) => {
                const lower = s.toLowerCase();
                return syns.some((syn) => lower.includes(syn));
            });
            if (!found) {
                missingSections.push(req);
            }
        }
        return {
            id,
            title,
            status,
            targetEdition,
            filePath,
            sections,
            missingSections,
            isValid: missingSections.length === 0,
        };
    }
    listRfcs() {
        const rfcs = this.getAllRfcs();
        if (rfcs.length === 0) {
            return "No RFCs found in " + this.rfcsDir;
        }
        const lines = [
            "=== HKD Language Evolution RFCs ===",
            `Found ${rfcs.length} RFC proposal(s):`,
            "",
            "ID   Status        Edition  Title",
            "──── ───────────── ──────── ───────────────────────────────────────────────────",
        ];
        for (const r of rfcs) {
            const idCol = r.id.padEnd(4);
            const statusCol = r.status.padEnd(13);
            const edCol = r.targetEdition.padEnd(8);
            lines.push(`${idCol} ${statusCol} ${edCol} ${r.title}`);
        }
        lines.push("", "Run `hkd rfc check <id>` to validate RFC compliance.", "Run `hkd rfc status <id>` to inspect compiler implementation readiness.");
        return lines.join("\n");
    }
    checkRfc(idOrAll) {
        const rfcs = this.getAllRfcs();
        const target = idOrAll && idOrAll !== "all"
            ? rfcs.filter((r) => r.id === idOrAll || r.id === idOrAll.padStart(3, "0"))
            : rfcs;
        if (target.length === 0) {
            return `RFC '${idOrAll}' not found.`;
        }
        const lines = ["=== RFC Conformance Check ==="];
        let allValid = true;
        for (const r of target) {
            lines.push(`\nRFC [${r.id}] ${r.title} (${path.basename(r.filePath)})`);
            lines.push(`  Status:         ${r.status}`);
            lines.push(`  Target Edition: ${r.targetEdition}`);
            lines.push(`  Sections Found: ${r.sections.length}`);
            if (r.isValid) {
                lines.push(`  RFC Conformance Status: PASS`);
                lines.push(`  Validation:     PASS (All mandatory sections present)`);
            }
            else {
                allValid = false;
                lines.push(`  RFC Conformance Status: FAIL`);
                lines.push(`  Validation:     FAIL`);
                lines.push(`  Missing:        ${r.missingSections.join(", ")}`);
            }
        }
        lines.push("", allValid
            ? `All ${target.length} RFCs pass conformance validation.`
            : "Some RFCs have missing sections. Please update them to comply with the standard.");
        return lines.join("\n");
    }
    statusRfc(id) {
        const rfcs = this.getAllRfcs();
        const target = id
            ? rfcs.filter((r) => r.id === id || r.id === id.padStart(3, "0"))
            : rfcs;
        if (target.length === 0) {
            return `RFC '${id}' not found.`;
        }
        const lines = ["=== RFC Implementation Status ==="];
        for (const r of target) {
            lines.push(`\nRFC [${r.id}] ${r.title}`);
            lines.push(`  Status:             ${r.status}`);
            lines.push(`  Lifecycle:          ${r.status}`);
            lines.push(`  Target Edition:     HKD ${r.targetEdition}`);
            switch (r.id) {
                case "001":
                    lines.push(`  Parser Support:     Implemented (generic functions fn id<T>(...))`);
                    lines.push(`  Semantic Checking:  Implemented (type substitution & inference)`);
                    lines.push(`  Bytecode Lowering:  Implemented (monomorphized / direct calling)`);
                    lines.push(`  Feature Flag:       #feature(generics)`);
                    break;
                case "002":
                    lines.push(`  Parser Support:     Implemented (match expr { pat => body })`);
                    lines.push(`  Semantic Checking:  Implemented (exhaustiveness & binding check)`);
                    lines.push(`  Bytecode Lowering:  Implemented (direct compare & conditional jumps)`);
                    lines.push(`  Feature Flag:       #feature(pattern_matching)`);
                    break;
                case "003":
                    lines.push(`  Design Status:      Approved specification in RFC 003`);
                    lines.push(`  Runtime Support:    Vtable / dictionary-passing scheduled for 1.2`);
                    lines.push(`  Feature Flag:       #feature(traits)`);
                    break;
                case "004":
                    lines.push(`  Design Status:      Approved ergonomic specification in RFC 004`);
                    lines.push(`  Event Loop:         Integrated with std.task / libuv backend`);
                    lines.push(`  Feature Flag:       #feature(async)`);
                    break;
                case "005":
                    lines.push(`  Type System:        Result<T, E> & structural variants active in std.result`);
                    lines.push(`  Feature Flag:       #feature(result)`);
                    break;
                default:
                    lines.push(`  Status:             Proposed`);
            }
        }
        return lines.join("\n");
    }
}
exports.RfcValidator = RfcValidator;
//# sourceMappingURL=rfc-validator.js.map