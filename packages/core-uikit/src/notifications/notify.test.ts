import { describe, it, expect, vi, beforeEach } from "vitest";
import { notify } from "./notify";
import { notificationStore } from "./store";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
    promise: vi.fn(),
  },
}));

describe("notify", () => {
  beforeEach(() => {
    notificationStore.clear();
  });

  it("success adds to toast and store", () => {
    notify.success("Item saved");
    expect(notificationStore.getAll()).toHaveLength(1);
    expect(notificationStore.getAll()[0].type).toBe("success");
    expect(notificationStore.getAll()[0].title).toBe("Item saved");
  });

  it("error adds to store", () => {
    notify.error("Something failed");
    expect(notificationStore.getAll()).toHaveLength(1);
    expect(notificationStore.getAll()[0].type).toBe("error");
  });

  it("silent option skips store", () => {
    notify.info("Silent msg", { silent: true });
    expect(notificationStore.getAll()).toHaveLength(0);
  });

  it("store tracks unread count", () => {
    notify.success("One");
    notify.error("Two");
    expect(notificationStore.getUnreadCount()).toBe(2);
    notificationStore.markAsRead(notificationStore.getAll()[0].id);
    expect(notificationStore.getUnreadCount()).toBe(1);
  });

  it("store markAllAsRead clears unread", () => {
    notify.success("A");
    notify.success("B");
    notificationStore.markAllAsRead();
    expect(notificationStore.getUnreadCount()).toBe(0);
  });

  it("store limits to 50 items", () => {
    for (let i = 0; i < 55; i++) {
      notify.info(`Item ${i}`);
    }
    expect(notificationStore.getAll()).toHaveLength(50);
  });
});
