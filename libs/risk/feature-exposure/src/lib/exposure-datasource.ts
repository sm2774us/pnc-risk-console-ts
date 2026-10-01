import type { IServerSideDatasource, IServerSideGetRowsParams } from 'ag-grid-community';
import type { SsrmRequest } from '@pnc/shared/domain';
import type { RiskApi } from '@pnc/risk/data-access';
import type { Subscription } from 'rxjs';

/**
 * Bridges Ag-Grid's server-side row model to the BFF. Each block request is an RxJS stream;
 * destroying the datasource (or the grid refreshing) unsubscribes in-flight calls (no orphan requests).
 */
export class ExposureDatasource implements IServerSideDatasource {
  private readonly inflight = new Set<Subscription>();
  constructor(
    private readonly api: Pick<RiskApi, 'queryExposures$'>,
    private readonly onError: (message: string) => void = () => undefined,
  ) {}

  getRows(params: IServerSideGetRowsParams): void {
    const req = params.request as unknown as SsrmRequest;
    const sub = this.api.queryExposures$(req).subscribe({
      next: (res) => {
        params.success({ rowData: res.rows, rowCount: res.lastRow });
      },
      error: (e: unknown) => {
        params.fail();
        this.onError(e instanceof Error ? e.message : 'Query failed');
      },
    });
    this.inflight.add(sub);
    sub.add(() => this.inflight.delete(sub));
  }

  destroy(): void {
    for (const s of this.inflight) s.unsubscribe();
    this.inflight.clear();
  }
}
