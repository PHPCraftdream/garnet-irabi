/**
 * Аргументы вызова и единый выход с ошибкой.
 *
 * Разбор живёт в модуле, а не в точке входа: флаги читают и команды, и
 * сборщики почты, а протаскивать их через пять слоёв параметров значило
 * бы описывать одно и то же в каждой подписи.
 */

export const argv = process.argv.slice(2);

export const flags = new Set(argv.filter((a) => a.startsWith('--')));

export const args = argv.filter((a) => !a.startsWith('--'));
export const [command, ...rest] = args;

export function die(message) {
    console.error(message);
    process.exit(1);
}
