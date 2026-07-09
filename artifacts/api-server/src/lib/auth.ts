import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET!;

export function generateToken(adminId: number): string {
  return jwt.sign({ role: "admin", adminId }, JWT_SECRET, { expiresIn: "30d" });
}

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = authHeader.slice(7);
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}










// import { Request, Response, NextFunction } from "express";
// import jwt from "jsonwebtoken";

// const JWT_SECRET = process.env.JWT_SECRET!;
// const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

// export function generateToken(): string {
//   return jwt.sign({ role: "admin" }, JWT_SECRET, { expiresIn: "24h" });
// }

// export function validatePassword(password: string): boolean {
//   return password === ADMIN_PASSWORD;
// }

// export function authMiddleware(
//   req: Request,
//   res: Response,
//   next: NextFunction,
// ): void {
//   const authHeader = req.headers.authorization;
//   if (!authHeader || !authHeader.startsWith("Bearer ")) {
//     res.status(401).json({ error: "Unauthorized" });
//     return;
//   }
//   const token = authHeader.slice(7);
//   try {
//     jwt.verify(token, JWT_SECRET);
//     next();
//   } catch {
//     res.status(401).json({ error: "Invalid or expired token" });
//   }
// }
