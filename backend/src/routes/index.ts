import { Router } from "express";
import { authRouter } from "./auth.routes.js";
import { familyRouter } from "./family.routes.js";
import { announcementRouter, commentRouter } from "./announcement.routes.js";
import { messageRouter } from "./message.routes.js";
import { uploadsRouter } from "./uploads.routes.js";
import { searchRouter } from "./search.routes.js";
import { communityRouter } from "./community.routes.js";
import { coachRouter } from "./coach.routes.js";
import { playdateRouter } from "./playdate.routes.js";

export const apiRouter = Router();
apiRouter.use("/auth", authRouter);
apiRouter.use("/family", familyRouter);
apiRouter.use("/announcements", announcementRouter);
// More specific path must be mounted BEFORE the generic /comments router so
// Express matches /comments/coach here instead of dispatching to commentRouter.
apiRouter.use("/comments/coach", coachRouter);
apiRouter.use("/comments", commentRouter);
apiRouter.use("/messages", messageRouter);
apiRouter.use("/uploads", uploadsRouter);
apiRouter.use("/search", searchRouter);
apiRouter.use("/community", communityRouter);
apiRouter.use("/playdates", playdateRouter);
