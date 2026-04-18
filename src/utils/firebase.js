import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBJ2LEiDINrUdjaOiUyeo68w-EGCyYOBLk",
  authDomain: "ecza-dolabim-6222d.firebaseapp.com",
  projectId: "ecza-dolabim-6222d",
  storageBucket: "ecza-dolabim-6222d.firebasestorage.app",
  messagingSenderId: "916126639906",
  appId: "1:916126639906:web:9394ed10b3fbeaad43a77b"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
