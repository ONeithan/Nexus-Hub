
import { ChartTypeRegistry, ChartDataset } from 'chart.js';
import { SankeyController, SankeyDataPoint } from 'chartjs-chart-sankey';

declare module 'chart.js' {
  interface ChartTypeRegistry {
    sankey: {
      chartOptions: SankeyController['options'];
      datasetOptions: ChartDataset<'sankey', SankeyDataPoint[]>;
      data: SankeyDataPoint[];
      parsed: any;
      scales: never;
    };
  }
}
