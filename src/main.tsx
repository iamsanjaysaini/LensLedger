import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import App from './App';
import './index.css';

// Data router (unsaved changes ko page badalne / back dabane par rokne ke liye zaroori hai).
// Saare pages App ke andar hi <Routes> se chalte hain, pehle jaisa.
const router = createBrowserRouter([{ path: '*', element: <App /> }]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <RouterProvider router={router} />
);
