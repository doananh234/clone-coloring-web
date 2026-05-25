import React from "react";

export type NotificationItem = {
  id: string;
  type: "success" | "error" | "info" | "warning";
  title: string;
  description?: string;
  read: boolean;
  createdAt: Date;
};

type Listener = () => void;

let notifications: NotificationItem[] = [];
let listeners: Listener[] = [];

function emit() {
  listeners.forEach((l) => l());
}

export const notificationStore = {
  getAll(): NotificationItem[] {
    return notifications;
  },

  getUnreadCount(): number {
    return notifications.filter((n) => !n.read).length;
  },

  add(item: Omit<NotificationItem, "id" | "read" | "createdAt">) {
    const notification: NotificationItem = {
      ...item,
      id: String(Date.now()) + String(Math.random()).slice(2, 6),
      read: false,
      createdAt: new Date(),
    };
    notifications = [notification, ...notifications].slice(0, 50); // keep max 50
    emit();
    return notification;
  },

  markAsRead(id: string) {
    notifications = notifications.map((n) =>
      n.id === id ? { ...n, read: true } : n
    );
    emit();
  },

  markAllAsRead() {
    notifications = notifications.map((n) => ({ ...n, read: true }));
    emit();
  },

  remove(id: string) {
    notifications = notifications.filter((n) => n.id !== id);
    emit();
  },

  clear() {
    notifications = [];
    emit();
  },

  subscribe(listener: Listener): () => void {
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  },
};

/** React hook to subscribe to notification store */
export function useNotifications() {
  const [, forceUpdate] = React.useState(0);

  React.useEffect(() => {
    return notificationStore.subscribe(() => forceUpdate((n) => n + 1));
  }, []);

  return {
    notifications: notificationStore.getAll(),
    unreadCount: notificationStore.getUnreadCount(),
    markAsRead: notificationStore.markAsRead,
    markAllAsRead: notificationStore.markAllAsRead,
    remove: notificationStore.remove,
    clear: notificationStore.clear,
  };
}
