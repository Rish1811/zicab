import { Router } from 'express';
import { chatModuleRouter } from '../chat/routes/index.js';
import { adminModuleRouter } from '../admin/routes/index.js';
import { driverModuleRouter } from '../driver/routes/index.js';
import { supportModuleRouter } from '../support/routes/index.js';
import { userModuleRouter } from '../user/routes/index.js';
import { commonRouter } from '../common/routes/commonRoutes.js';
import { careerRouter } from '../career/routes/careerRoutes.js';
import { busModuleRouter } from '../bus/routes/index.js';
import { rewardRouter } from '../rewards/routes/rewardRoutes.js';
import { challengeRouter } from '../challenges/routes/challengeRoutes.js';
import { driverHoursRouter } from '../driverHours/routes/driverHoursRoutes.js';
import { testRideRouter } from '../testRides/routes/testRideRoutes.js';

export const taxiRouter = Router();

taxiRouter.use(chatModuleRouter);
taxiRouter.use(adminModuleRouter);
taxiRouter.use(userModuleRouter);
taxiRouter.use(driverModuleRouter);
taxiRouter.use(supportModuleRouter);
taxiRouter.use(commonRouter);
taxiRouter.use(careerRouter);
taxiRouter.use(busModuleRouter);
taxiRouter.use(rewardRouter);
taxiRouter.use(challengeRouter);
taxiRouter.use(driverHoursRouter);
taxiRouter.use(testRideRouter);
