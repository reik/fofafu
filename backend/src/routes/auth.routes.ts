import { Router } from "express";
import { register, verifyEmail, login, forgotPassword, resetPassword, changePassword } from "../controllers/auth.controller.js";
import { validate } from "../middleware/validate.middleware.js";
import { authenticate } from "../middleware/auth.middleware.js";
import {
  RegisterInput,
  LoginInput,
  VerifyQuery,
  ForgotPasswordInput,
  ResetPasswordInput,
  ChangePasswordInput,
} from "../schemas/auth.schemas.js";

export const authRouter = Router();

authRouter.post("/register", validate(RegisterInput, "body"), register);
authRouter.get("/verify", validate(VerifyQuery, "query"), verifyEmail);
authRouter.post("/login", validate(LoginInput, "body"), login);
authRouter.post("/forgot-password", validate(ForgotPasswordInput, "body"), forgotPassword);
authRouter.post("/reset-password", validate(ResetPasswordInput, "body"), resetPassword);
authRouter.post("/change-password", authenticate, validate(ChangePasswordInput, "body"), changePassword);
