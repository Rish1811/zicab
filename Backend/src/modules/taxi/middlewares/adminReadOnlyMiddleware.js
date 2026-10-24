import { ApiError } from '../../../utils/ApiError.js';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/// View-only admins (Admin.read_only) can open everything their permissions
/// allow but change nothing: any request that could write is refused here,
/// on the server, whatever the panel shows. `allow` lists [method, pathRegex]
/// pairs that only record the viewer's own state (e.g. marking a chat read).
export const enforceAdminReadOnly = (allow = []) => (req, _res, next) => {
  if (!req.auth?.admin?.read_only || READ_METHODS.has(req.method)) {
    return next();
  }
  const path = req.originalUrl.split('?')[0];
  if (allow.some(([method, pattern]) => method === req.method && pattern.test(path))) {
    return next();
  }
  return next(new ApiError(403, 'This is a view-only admin account. Changes are not allowed.'));
};
