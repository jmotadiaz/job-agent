import { describe, it, expect, vi } from "vitest";
import { parseProfile } from "../parse";

describe("parseProfile", () => {
  it("parses a valid profile with the new structure", () => {
    const content = `---
search:
  queries: ["engineer"]
profile:
  name: Javier Mota
  role: Architect
  email: javi@example.com
  phone: "123"
  location: Seville
  linkedinUrl: https://linkedin.com/in/javi
---
# Body`;
    const parsed = parseProfile(content);
    expect(parsed.profile.name).toBe("Javier Mota");
    expect(parsed.profile.linkedinUrl).toBe("https://linkedin.com/in/javi");
    expect(parsed.profile.website).toBeNull();
  });

  it("handles optional website", () => {
    const content = `---
search:
  queries: ["engineer"]
profile:
  name: J
  role: R
  email: E
  phone: P
  location: L
  linkedinUrl: LI
  website: https://site.com
---
# Body`;
    const parsed = parseProfile(content);
    expect(parsed.profile.website).toBe("https://site.com");
  });

  it("throws error if profile section is missing", () => {
    const content = `---
search:
  queries: ["engineer"]
---
# Body`;
    expect(() => parseProfile(content)).toThrow('profile.md must contain a frontmatter "profile" section');
  });

  it("throws error if required fields are missing", () => {
    const content = `---
search:
  queries: ["engineer"]
profile:
  name: J
---
# Body`;
    expect(() => parseProfile(content)).toThrow('frontmatter "profile" is missing required field: "role"');
  });

  it("handles legacy linkedinProfile with warning and fallback", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const content = `---
search:
  queries: ["engineer"]
linkedinProfile: https://linkedin.com/legacy
profile:
  name: J
  role: R
  email: E
  phone: P
  location: L
  linkedinUrl: ""
---
# Body`;
    const parsed = parseProfile(content);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("deprecated"));
    expect(parsed.profile.linkedinUrl).toBe("https://linkedin.com/legacy");
    spy.mockRestore();
  });
});
