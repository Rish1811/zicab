import { Router } from 'express';
import { asyncHandler } from '../../../../utils/asyncHandler.js';
import { authenticate } from '../../middlewares/authMiddleware.js';
import {
  createDelivery,
  getDelivery,
  getMyActiveDelivery,
  listMyDeliveries,
  quoteDelivery,
} from '../controllers/deliveryController.js';

export const deliveryRouter = Router();

// Priced before booking, using the same breakdown the booking itself uses, so
// the number shown to the rider is the number charged.
deliveryRouter.post('/quote', authenticate(['user']), asyncHandler(quoteDelivery));
deliveryRouter.post('/', authenticate(['user']), asyncHandler(createDelivery));
deliveryRouter.get('/', authenticate(['user']), asyncHandler(listMyDeliveries));
deliveryRouter.get('/active/me', authenticate(['user', 'driver']), asyncHandler(getMyActiveDelivery));
deliveryRouter.get('/:deliveryId', authenticate(['user', 'driver']), asyncHandler(getDelivery));
