import { Router } from "express";
import { authRouter } from "./auth.routes.js";
import { familyRouter } from "./family.routes.js";
import { announcementRouter, commentRouter } from "./announcement.routes.js";
import { messageRouter } from "./message.routes.js";

export const apiRouter = Router();
apiRouter.use("/auth", authRouter);
apiRouter.use("/family", familyRouter);
apiRouter.use("/announcements", announcementRouter);
apiRouter.use("/comments", commentRouter);
apiRouter.use("/messages", messageRouter);
