import { Routes } from 'react-router-dom';
import adminRoutes from './adminRoutes';
import driverRoutes from './driverRoutes';
import ownerRoutes from './ownerRoutes';
import publicRoutes from './publicRoutes';
import userRoutes from './userRoutes';
import dhabaRoutes from './dhabaRoutes';

const AppRoutes = () => (
  <Routes>
    {publicRoutes}
    {userRoutes}
    {driverRoutes}
    {ownerRoutes}
    {dhabaRoutes}
    {adminRoutes}
  </Routes>
);

export default AppRoutes;
