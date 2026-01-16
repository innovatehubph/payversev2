import { Server as HttpServer } from "http";
import { Server as SocketServer, Socket } from "socket.io";

let io: SocketServer | null = null;

export function initializeWebSocket(httpServer: HttpServer) {
  io = new SocketServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    },
    path: "/ws"
  });

  io.on("connection", (socket: Socket) => {
    console.log(`[WebSocket] Client connected: ${socket.id}`);

    // Get user ID from auth handshake
    const userId = socket.handshake.auth.userId;
    if (userId) {
      socket.join(`user:${userId}`);
      console.log(`[WebSocket] User ${userId} joined their room`);
    }

    // Admin joins admin room
    socket.on("join-admin", () => {
      socket.join("admin");
      console.log(`[WebSocket] Socket ${socket.id} joined admin room`);
    });

    // Leave admin room
    socket.on("leave-admin", () => {
      socket.leave("admin");
      console.log(`[WebSocket] Socket ${socket.id} left admin room`);
    });

    socket.on("disconnect", (reason) => {
      console.log(`[WebSocket] Client disconnected: ${socket.id}, reason: ${reason}`);
    });

    socket.on("error", (error) => {
      console.error(`[WebSocket] Socket error: ${socket.id}`, error);
    });
  });

  console.log("[WebSocket] Server initialized");
  return io;
}

// Emit event to a specific user
export function emitToUser(userId: number, event: string, data: any) {
  if (!io) {
    console.warn("[WebSocket] Server not initialized, cannot emit to user");
    return;
  }
  io.to(`user:${userId}`).emit(event, data);
  console.log(`[WebSocket] Emitted ${event} to user:${userId}`);
}

// Emit event to all admins
export function emitToAdmins(event: string, data: any) {
  if (!io) {
    console.warn("[WebSocket] Server not initialized, cannot emit to admins");
    return;
  }
  io.to("admin").emit(event, data);
  console.log(`[WebSocket] Emitted ${event} to admin room`);
}

// Broadcast withdrawal status change to both user and admins
export function broadcastWithdrawalUpdate(withdrawal: any) {
  emitToUser(withdrawal.userId, "withdrawal:updated", withdrawal);
  emitToAdmins("admin:withdrawal:updated", withdrawal);
}

// Broadcast new withdrawal request to admins
export function broadcastNewWithdrawal(withdrawal: any) {
  emitToAdmins("admin:withdrawal:new", withdrawal);
}

// Broadcast balance update to a specific user
export function broadcastBalanceUpdate(userId: number, balanceData: {
  phptBalance: string;
  fiatBalance: string;
  totalBalance: string;
}) {
  emitToUser(userId, "balance:updated", balanceData);
}

// Get Socket.IO server instance
export function getIO(): SocketServer | null {
  return io;
}
