import { describe, expect, it } from "vitest";

import {
  GOOGLE_PLAY_LAUNCH_TASKS,
  googlePlayLaunchProgress,
  normalizeGooglePlayLaunchPlan,
  toggleGooglePlayLaunchTask,
} from "./launch-plan";

describe("Google Play public launch plan", () => {
  it("starts with one clear next action", () => {
    const progress = googlePlayLaunchProgress();
    expect(progress.completed).toBe(0);
    expect(progress.total).toBe(GOOGLE_PLAY_LAUNCH_TASKS.length);
    expect(progress.percent).toBe(0);
    expect(progress.complete).toBe(false);
    expect(progress.nextTask?.id).toBe("internal-test-installed");
  });

  it("persists a manual confirmation without duplicates", () => {
    const once = toggleGooglePlayLaunchTask(undefined, "internal-test-installed", true, "now");
    const twice = toggleGooglePlayLaunchTask(once, "internal-test-installed", true, "later");
    expect(twice.completedTasks).toEqual(["internal-test-installed"]);
    expect(twice.updatedAt).toBe("later");
  });

  it("allows a user to reopen a task", () => {
    const plan = {
      completedTasks: ["internal-test-installed", "internal-test-validated"] as const,
    };
    const reopened = toggleGooglePlayLaunchTask(
      { completedTasks: [...plan.completedTasks] },
      "internal-test-installed",
      false,
      "now",
    );
    expect(reopened.completedTasks).toEqual(["internal-test-validated"]);
  });

  it("never trusts unknown persisted task identifiers", () => {
    const normalized = normalizeGooglePlayLaunchPlan({
      completedTasks: ["store-texts", "unknown-task"] as never,
    });
    expect(normalized.completedTasks).toEqual(["store-texts"]);
  });

  it("only announces completion after every declaration", () => {
    const plan = { completedTasks: GOOGLE_PLAY_LAUNCH_TASKS.map((task) => task.id) };
    const progress = googlePlayLaunchProgress(plan);
    expect(progress.complete).toBe(true);
    expect(progress.percent).toBe(100);
    expect(progress.nextTask).toBeUndefined();
  });
});
