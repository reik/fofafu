import { Router } from "express";
import { authRouter } from "./auth.routes.js";
import { familyRouter } from "./family.routes.js";

export const apiRouter = Router();
apiRouter.use("/auth", authRouter);
apiRouter.use("/family", familyRouter);
