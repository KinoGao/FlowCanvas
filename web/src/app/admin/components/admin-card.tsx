import { Card } from "antd";

export function AdminCard(props: { title: string; description?: string; action?: React.ReactNode; children: React.ReactNode }) {
    return <Card className="rounded-[26px] border-white/70 bg-white/86 shadow-[0_18px_55px_rgba(0,0,0,0.08)] backdrop-blur dark:border-white/10 dark:bg-white/8"><div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h2 className="m-0 text-lg font-semibold">{props.title}</h2>{props.description ? <p className="m-0 mt-1 text-sm leading-6 text-gray-500 dark:text-white/55">{props.description}</p> : null}</div>{props.action}</div>{props.children}</Card>;
}
