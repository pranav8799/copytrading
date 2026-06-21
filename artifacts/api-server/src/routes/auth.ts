import { Router } from "express";
import { generateToken, validatePassword } from "../lib/auth";
import { LoginBody, LoginResponse } from "@workspace/api-zod";

const router = Router();

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing password" });
    return;
  }
  if (!validatePassword(parsed.data.password)) {
    res.status(401).json({ error: "Invalid password" });
    return;
  }
  const token = generateToken();
  res.json(LoginResponse.parse({ token }));
});

export default router;
