import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBell,
  faCheck,
  faCircleCheck,
  faCircleExclamation,
  faCircleInfo,
  faTriangleExclamation,
  faTrash,
  faCheckDouble,
} from "@fortawesome/pro-regular-svg-icons";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Separator } from "../ui/separator";
import { ScrollArea } from "../ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { useNotifications, type NotificationItem } from "../../notifications/store";
import { cn } from "../../utils/cn";

const typeIcon: Record<NotificationItem["type"], React.ReactNode> = {
  success: <FontAwesomeIcon icon={faCircleCheck} className="h-4 w-4 text-emerald-500" />,
  error: <FontAwesomeIcon icon={faCircleExclamation} className="h-4 w-4 text-destructive" />,
  info: <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4 text-blue-500" />,
  warning: <FontAwesomeIcon icon={faTriangleExclamation} className="h-4 w-4 text-amber-500" />,
};

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function NotificationRow({
  item,
  onRead,
  onRemove,
}: {
  item: NotificationItem;
  onRead: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div
      className={cn(
        "group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/50",
        !item.read && "bg-muted/30",
      )}
    >
      <div className="mt-0.5 shrink-0">{typeIcon[item.type]}</div>
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm leading-snug", !item.read && "font-medium")}>{item.title}</p>
        {item.description && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.description}</p>
        )}
        <p className="text-xs text-muted-foreground mt-1">{timeAgo(item.createdAt)}</p>
      </div>
      <div className="flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {!item.read && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={(e) => {
              e.stopPropagation();
              onRead(item.id);
            }}
          >
            <FontAwesomeIcon icon={faCheck} className="h-3 w-3" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(item.id);
          }}
        >
          <FontAwesomeIcon icon={faTrash} className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

export function NotificationBell() {
  const { notifications, unreadCount, markAsRead, markAllAsRead, remove, clear } =
    useNotifications();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8">
          <FontAwesomeIcon icon={faBell} className="h-4 w-4" />
          {unreadCount > 0 && (
            <Badge
              className="absolute -top-1 -right-1 h-4 min-w-4 rounded-full px-1 text-[10px] leading-none"
              variant="destructive"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-4 py-3">
          <h4 className="text-sm font-semibold">Notifications</h4>
          <div className="flex gap-1">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-auto px-2 py-1 text-xs text-muted-foreground"
                onClick={markAllAsRead}
              >
                <FontAwesomeIcon icon={faCheckDouble} className="mr-1 h-3 w-3" />
                Read all
              </Button>
            )}
            {notifications.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-auto px-2 py-1 text-xs text-muted-foreground"
                onClick={clear}
              >
                Clear
              </Button>
            )}
          </div>
        </div>
        <Separator />
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <FontAwesomeIcon icon={faBell} className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm">No notifications</p>
          </div>
        ) : (
          <ScrollArea className="max-h-80">
            <div className="divide-y">
              {notifications.map((item) => (
                <NotificationRow key={item.id} item={item} onRead={markAsRead} onRemove={remove} />
              ))}
            </div>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}
