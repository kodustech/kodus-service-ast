import { TaskService } from '@/core/application/services/task/task.service.js';
import { type SuggestionDiagnosticRequest } from '@/shared/types/lsp.js';
import { Body, Controller, Get, Param, Post } from '@nestjs/common';

@Controller('lsp')
export class LspController {
    constructor(private readonly taskService: TaskService) {}

    @Post('suggestion/diagnostic')
    suggestionDiagnostic(@Body() body: SuggestionDiagnosticRequest) {
        return this.taskService.createAsyncTask({
            type: 'LSP_SUGGESTION_DIAGNOSTIC',
            priority: body.priority,
            payload: body,
        });
    }

    @Get('suggestion/diagnostic/:id')
    getSuggestionDiagnostic(@Param('id') id: string) {
        return this.taskService.getTaskResult<any>(id);
    }
}
