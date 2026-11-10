import { handleNameTool } from '../../_lib/name-tool-service.mjs';
export const onRequest = ({ request, env }) => handleNameTool(request, env);
