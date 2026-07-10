<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Services {
    use Aura\Cli\Stdio;
    use Aura\Cli\Stdio\Formatter;
    use Aura\Cli\Stdio\Handle;

    /**
     * Stdio-обёртка с дополнительной записью всего вывода в строковый буфер.
     *
     * Используется при запуске cron-задач: позволяет показать то, что задача
     * напечатала, в админском логе. Поведение CLI не меняется — родительские
     * методы вызываются как раньше.
     */
    class CapturingStdio extends Stdio {
        private string $buffer = '';

        public function __construct(Handle $stdin, Handle $stdout, Handle $stderr, Formatter $formatter) {
            parent::__construct($stdin, $stdout, $stderr, $formatter);
        }

        // NOTE: Aura Stdio::outln/errln internally call $this->out/$this->err
        // (virtual). To avoid double-capturing we only append to the buffer
        // in out/err and let outln/errln delegate to them via parent.

        public function out($string = null) {
            $this->buffer .= (string)($string ?? '');
            parent::out($string);
            return null;
        }

        public function outln($string = null) {
            parent::outln($string);
            return null;
        }

        public function err($string = null) {
            $this->buffer .= (string)($string ?? '');
            parent::err($string);
            return null;
        }

        public function errln($string = null) {
            parent::errln($string);
            return null;
        }

        public function getBuffer(): string {
            return $this->buffer;
        }

        public function resetBuffer(): void {
            $this->buffer = '';
        }
    }
}
