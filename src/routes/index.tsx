import { createFileRoute } from "@tanstack/react-router";
import { TetrisApp } from "@/components/tetris-app";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <TetrisApp />;
}
