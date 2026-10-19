import { Route } from 'react-router-dom';
import { DhabaLayout, DhabaLogin, DhabaMenu, DhabaOrders } from './lazyPages';

// Partner panel for highway dhabas (ZI Bus food pre-orders).
const dhabaRoutes = (
  <>
    <Route path="/dhaba/login" element={<DhabaLogin />} />
    <Route path="/dhaba" element={<DhabaLayout />}>
      <Route index element={<DhabaOrders />} />
      <Route path="menu" element={<DhabaMenu />} />
    </Route>
  </>
);

export default dhabaRoutes;
