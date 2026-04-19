import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBLU3MnfjUvWpL_Smew0T90dwxkNhFnN3c",
  authDomain: "poslaundry-v0.firebaseapp.com",
  projectId: "poslaundry-v0",
  storageBucket: "poslaundry-v0.firebasestorage.app",
  messagingSenderId: "1078193498681",
  appId: "1:1078193498681:web:d7d2767afd12fd84dbfbe8"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
