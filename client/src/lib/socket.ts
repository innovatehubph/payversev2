import { io, Socket } from "socket.io-client";
import { getAuthToken } from "./api";

let socket: Socket | null = null;

export function initSocket(userId: number): Socket {
  // If socket exists and is connected, return it
  if (socket?.connected) {
    return socket;
  }

  // Disconnect existing socket if any
  if (socket) {
    socket.disconnect();
  }

  // Create new socket connection
  socket = io(window.location.origin, {
    path: "/ws",
    auth: {
      userId,
      token: getAuthToken()
    },
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });

  socket.on("connect", () => {
    console.log("[Socket] Connected:", socket?.id);
  });

  socket.on("disconnect", (reason) => {
    console.log("[Socket] Disconnected:", reason);
  });

  socket.on("connect_error", (error) => {
    console.error("[Socket] Connection error:", error.message);
  });

  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
    console.log("[Socket] Disconnected manually");
  }
}

// Join admin room for receiving admin notifications
export function joinAdminRoom(): void {
  if (socket?.connected) {
    socket.emit("join-admin");
    console.log("[Socket] Joined admin room");
  }
}

// Leave admin room
export function leaveAdminRoom(): void {
  if (socket?.connected) {
    socket.emit("leave-admin");
    console.log("[Socket] Left admin room");
  }
}

// Subscribe to withdrawal updates for a specific user
export function onWithdrawalUpdate(callback: (data: any) => void): () => void {
  if (!socket) return () => {};

  socket.on("withdrawal:updated", callback);

  // Return unsubscribe function
  return () => {
    socket?.off("withdrawal:updated", callback);
  };
}

// Subscribe to new withdrawal notifications (for admins)
export function onNewWithdrawal(callback: (data: any) => void): () => void {
  if (!socket) return () => {};

  socket.on("admin:withdrawal:new", callback);

  return () => {
    socket?.off("admin:withdrawal:new", callback);
  };
}

// Subscribe to withdrawal updates (for admins)
export function onAdminWithdrawalUpdate(callback: (data: any) => void): () => void {
  if (!socket) return () => {};

  socket.on("admin:withdrawal:updated", callback);

  return () => {
    socket?.off("admin:withdrawal:updated", callback);
  };
}

// Subscribe to balance updates
export function onBalanceUpdate(callback: (data: {
  phptBalance: string;
  fiatBalance: string;
  totalBalance: string;
}) => void): () => void {
  if (!socket) return () => {};

  socket.on("balance:updated", callback);
  console.log("[Socket] Subscribed to balance:updated");

  return () => {
    socket?.off("balance:updated", callback);
    console.log("[Socket] Unsubscribed from balance:updated");
  };
}
